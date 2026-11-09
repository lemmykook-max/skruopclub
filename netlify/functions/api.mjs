// Skru Op Club API: one Netlify Function behind /api/*.
// Login: Netlify Identity (the token is checked against /.netlify/identity/user).
// Data: Netlify Blobs, store "skruop", keys members/<uid>, tasks/<id>, signups/<taskId>__<uid>.
import { getStore } from "@netlify/blobs";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(body),
});
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v, maxItems, maxLen) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems) : [];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => /^\d{2}:\d{2}$/.test(s);
const safeId = (s) => /^[a-z0-9]{6,40}$/.test(s);

async function readPrefix(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const rows = await Promise.all(
    blobs.map(async (b) => ({ key: b.key, value: await store.get(b.key, { type: "json" }) }))
  );
  return rows.filter((r) => r.value);
}

export async function route({ method, path, body, user, store }) {
  if (!user || !user.sub) return json(401, { error: "Log ind for at fortsætte." });
  const uid = user.sub;
  const roles = (user.app_metadata && user.app_metadata.roles) || [];
  // Admins: Identity role "admin", or an e-mail listed in the ADMIN_EMAILS environment variable (comma-separated)
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = roles.includes("admin") || (!!user.email && adminEmails.includes(String(user.email).toLowerCase()));
  const seg = path.split("/").filter(Boolean); // e.g. ["tasks", "<id>", "join"]

  // GET /state: everything the app shows
  if (method === "GET" && seg[0] === "state") {
    const [members, tasks, signups] = await Promise.all([
      readPrefix(store, "members/"),
      readPrefix(store, "tasks/"),
      readPrefix(store, "signups/"),
    ]);
    const m = {};
    for (const r of members) m[r.key.slice(8)] = r.value;
    return json(200, {
      me: { uid, isAdmin, email: user.email || "" },
      members: m,
      tasks: tasks.map((r) => r.value),
      signups: signups.map((r) => ({ taskId: r.value.taskId, uid: r.value.uid })),
    });
  }

  // PUT /profile: create or update your own member profile
  if (method === "PUT" && seg[0] === "profile") {
    const name = str(body.name, 60);
    if (!name) return json(400, { error: "Skriv dit navn, så de andre ved, hvem der kommer." });
    const prev = (await store.get("members/" + uid, { type: "json" })) || {};
    const profile = {
      name,
      area: str(body.area, 60),
      about: str(body.about, 400),
      tags: strList(body.tags, 25, 40),
      skills: strList(body.skills, 25, 40),
      joinedAt: prev.joinedAt || new Date().toISOString(),
    };
    await store.setJSON("members/" + uid, profile);
    return json(200, { ok: true, profile });
  }

  const me = await store.get("members/" + uid, { type: "json" });
  if (!me) return json(403, { error: "Lav din profil, før du opretter eller melder dig på opgaver." });

  // POST /tasks: create a task, you are the host
  if (method === "POST" && seg[0] === "tasks" && seg.length === 1) {
    const title = str(body.title, 90);
    const date = str(body.date, 10);
    if (!title) return json(400, { error: "Skriv kort, hvad der skal laves." });
    if (!isDate(date)) return json(400, { error: "Vælg en dato." });
    const time = isTime(str(body.time, 5)) ? str(body.time, 5) : "";
    const hands = Math.max(1, Math.min(12, parseInt(body.hands, 10) || 3));
    const id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const task = {
      id, title, date, time, hands,
      place: str(body.place, 120),
      bring: str(body.bring, 160),
      plan: str(body.plan, 300),
      host: uid,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    await store.setJSON("tasks/" + id, task);
    return json(201, { ok: true, task });
  }

  if (seg[0] === "tasks" && seg[1]) {
    const id = seg[1];
    if (!safeId(id)) return json(404, { error: "Opgaven findes ikke." });
    const task = await store.get("tasks/" + id, { type: "json" });
    if (!task) return json(404, { error: "Opgaven findes ikke længere." });
    const canManage = task.host === uid || isAdmin;
    const action = seg[2] || "";

    if (method === "POST" && action === "join") {
      if (task.status === "done") return json(409, { error: "Opgaven er allerede skruet op." });
      if (task.host === uid) return json(409, { error: "Det er din egen opgave." });
      const current = await readPrefix(store, "signups/" + id + "__");
      if (current.some((r) => r.value.uid === uid)) return json(200, { ok: true });
      if (current.length >= task.hands) return json(409, { error: "Holdet er fuldt." });
      await store.setJSON("signups/" + id + "__" + uid, { taskId: id, uid, at: new Date().toISOString() });
      return json(200, { ok: true });
    }
    if (method === "POST" && action === "leave") {
      await store.delete("signups/" + id + "__" + uid);
      return json(200, { ok: true });
    }
    if (method === "POST" && action === "done") {
      if (!canManage) return json(403, { error: "Kun værten kan markere opgaven som skruet op." });
      await store.setJSON("tasks/" + id, { ...task, status: "done", doneAt: new Date().toISOString() });
      return json(200, { ok: true });
    }
    if (method === "DELETE" && !action) {
      if (!canManage) return json(403, { error: "Kun værten kan slette opgaven." });
      const sus = await readPrefix(store, "signups/" + id + "__");
      await Promise.all(sus.map((r) => store.delete(r.key)));
      await store.delete("tasks/" + id);
      return json(200, { ok: true });
    }
  }

  return json(404, { error: "Ukendt handling." });
}

// Netlify Functions v2: Blobs is wired up automatically, and the function answers on /api/*.
export const config = { path: "/api/*" };

// Ask Netlify Identity who the token belongs to (the same site's /.netlify/identity/user endpoint).
async function identify(req) {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return null;
  const res = await fetch(new URL("/.netlify/identity/user", req.url), { headers: { authorization: auth } });
  if (!res.ok) return null;
  const u = await res.json();
  return u && u.id ? { sub: u.id, email: u.email || "", app_metadata: u.app_metadata || {} } : null;
}

export default async (req) => {
  let r;
  try {
    const store = getStore({ name: "skruop", consistency: "strong" });
    const path = new URL(req.url).pathname.replace(/^.*?\/(?:\.netlify\/functions\/)?api(?=\/|$)/, "");
    let body = {};
    if (req.method !== "GET" && req.method !== "DELETE") {
      const text = await req.text();
      if (text) { try { body = JSON.parse(text) || {}; } catch { body = null; } }
    }
    if (body === null) r = json(400, { error: "Ugyldige data." });
    else r = await route({ method: req.method, path, body, user: await identify(req), store });
  } catch (err) {
    console.error(err);
    r = json(500, { error: "Noget gik galt hos os: " + String((err && err.message) || err).slice(0, 200) });
  }
  return new Response(r.body, { status: r.statusCode, headers: r.headers });
};
