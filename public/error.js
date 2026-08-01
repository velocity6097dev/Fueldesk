// Standalone on purpose — this page has to work even when everything
// else (Supabase, the rest of the app) might be unreachable, so it
// doesn't depend on supabaseClient.js/authGuard.js/ui.js at all.

const ERROR_TYPES = {
    offline: {
        title: "You're Offline",
        message: 'FuelDesk needs an internet connection to load rates and save bills. Reconnect and try again.',
    },
    404: {
        title: 'Page Not Found',
        message: "The page you're looking for isn't available.",
    },
    500: {
        title: 'Something Went Wrong',
        message: 'An unexpected error occurred on the server. Please try again.',
    },
    402: {
        title: 'Payment Required',
        message: 'Please confirm payment with the developer to continue using this service.',
    },
    generic: {
        title: 'Something Went Wrong',
        message: 'An unexpected error occurred. Please try again.',
    },
};

const titleEl = document.getElementById('error-title');
const messageEl = document.getElementById('error-message');
const statusEl = document.getElementById('error-status');
const retryBtn = document.getElementById('retry-btn');
const homeBtn = document.getElementById('home-btn');

const params = new URLSearchParams(window.location.search);
const requestedType = params.get('type');
// No explicit type and we're actually offline right now → show the
// offline message even if something else sent us here (e.g. a failed
// fetch on another page). Otherwise default to a generic 404, since
// landing here with no type is almost always via a broken/old link.
const type = ERROR_TYPES[requestedType] ? requestedType : (navigator.onLine ? '404' : 'offline');
const info = ERROR_TYPES[type];

titleEl.textContent = info.title;
messageEl.textContent = info.message;

retryBtn.addEventListener('click', () => window.location.reload());
homeBtn.addEventListener('click', () => window.location.href = '/billing.html');

// For the offline case specifically, keep the person informed without
// making them guess-and-check by repeatedly tapping Try Again.
if (type === 'offline') {
    function updateStatus() {
        if (navigator.onLine) {
            statusEl.textContent = 'Back online — tap Try Again to continue.';
            statusEl.classList.add('online');
        } else {
            statusEl.textContent = 'Still offline — waiting for a connection...';
            statusEl.classList.remove('online');
        }
    }
    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
}
