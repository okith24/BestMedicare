const KEY = "bmn_patient_users";

function readList() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeList(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function getPatientUsers() {
  return readList();
}

export function findPatientByEmail(email) {
  const target = String(email || "").trim().toLowerCase();
  return readList().find((u) => String(u.email || "").toLowerCase() === target) || null;
}

export function savePatientUser(user) {
  const next = {
    name: String(user.name || "").trim(),
    email: String(user.email || "").trim().toLowerCase(),
    phone: String(user.phone || "").trim(),
    password: String(user.password || ""),
    role: "patient",
    createdAt: new Date().toISOString(),
  };

  const list = readList();
  const idx = list.findIndex((u) => u.email === next.email);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...next };
  } else {
    list.push(next);
  }
  writeList(list);
  return next;
}
