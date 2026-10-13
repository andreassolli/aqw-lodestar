
const notification = document.getElementById('notification');
const action = document.getElementById('action');
const trigger = document.getElementById('trigger');

let hideTimer;

window.notificationAPI.onShow((data) => {
    action.textContent = `${data.role} — ${data.action}`;
    trigger.textContent = data.trigger || '';

    notification.classList.add('visible');

    clearTimeout(hideTimer);

    hideTimer = setTimeout(() => {
        notification.classList.remove('visible');

        setTimeout(() => {
            window.notificationAPI.hide();
        }, 200);
    }, 2500);
});
