/**
 * 期限通知トーストを表示するタイマーの監視プログラム。
 * Service Workerでブラウザ側でタイマーを管理するようになる。
 * 
 */
const timers = new Map();

function buildBody(notifyMinutes) {
    return notifyMinutes === 0 ? '期限になりました' : `${notifyMinutes}分後に期限です`;
}

self.addEventListener('message', event => {
    if (event.data?.type !== 'SCHEDULE') {
        return;
    }
    timers.forEach(id => clearTimeout(id));
    timers.clear();

    const now = Date.now();
    for (const { id, title, notifyAt, notifyMinutes } of (event.data.items ?? [])) {
        const delay = notifyAt - now;
        if (delay <= 0) {
            continue;
        }
        timers.set(id, setTimeout(() => {
            timers.delete(id);
            self.registration.showNotification(title, {
                body: buildBody(notifyMinutes),
                icon: '/fuyuco/todo.png',
            });
        }, delay));
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const fuyucoClient = list.find(c => c.url.includes('/fuyuco'));
            if (fuyucoClient) {
                return fuyucoClient.focus();
            }
            return clients.openWindow('/fuyuco');
        })
    );
});
