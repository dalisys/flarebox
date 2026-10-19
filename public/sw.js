const CACHE_NAME = "agentic-inbox-offline-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)));
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		Promise.all([
			caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))),
			self.clients.claim(),
		]),
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.mode !== "navigate") return;
	event.respondWith(
		fetch(event.request).catch(async () => {
			return (await caches.match(OFFLINE_URL)) || Response.error();
		}),
	);
});

self.addEventListener("push", (event) => {
	const data = event.data ? event.data.json() : {};
	event.waitUntil(
		self.registration.showNotification(data.title || "New email", {
			body: data.body || "",
			tag: data.tag,
			icon: "/icon-192.png",
			badge: "/icon-192.png",
			data: { url: data.url || "/" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
			const open = windows.find((client) => client.url.startsWith(self.location.origin));
			if (open) return open.navigate(url).then((client) => (client || open).focus());
			return self.clients.openWindow(url);
		}),
	);
});
