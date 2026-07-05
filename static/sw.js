/**
 * 期限通知トーストを表示するタイマーの監視プログラム。
 * Service Workerでブラウザ側でタイマーを管理するようになる。
 *
 */
const timers = new Map();

/**
 * 通知タイトル（タイミングメッセージ）を生成する。
 *
 * @param {number} notifyMinutes - 期限の何分前に通知するか（0=期限時刻）
 * @returns {string} 通知タイトル文字列
 */
function buildTitle(notifyMinutes) {
    return notifyMinutes === 0 ? '期限になりました' : `${notifyMinutes}分後に期限です`;
}

/**
 * トーストの表示処理 
 * 
 */
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
            self.registration.showNotification(buildTitle(notifyMinutes), {
                body: title,
                icon: '/fuyuco/todo.png',
                actions: [
                    { action: 'open', title: '確認' },
                    { action: 'close', title: '閉じる' },
                ],
            });
        }, delay));
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'close') {
        // 通知トーストの閉じるボタン。そのまま閉じる。
        return;
    }
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            // トーストの確認ボタン。該当のTODOを表示する。
            const fuyucoClient = list.find(c => c.url.includes('/fuyuco'));
            if (fuyucoClient) {
                return fuyucoClient.focus();
            }
            return clients.openWindow('/fuyuco#todo');
        })
    );
});
