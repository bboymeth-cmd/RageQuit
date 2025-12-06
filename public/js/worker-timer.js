// worker-timer.js
// A simple Web Worker to provide a consistent tick interval, unaffected by main thread throttling.

let intervalId = null;
const TICK_RATE = 50; // 50ms = 20 ticks per second (matches POSITION_UPDATE_RATE)

self.onmessage = function (e) {
    if (e.data === 'start') {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(() => {
            self.postMessage('tick');
        }, TICK_RATE);
    } else if (e.data === 'stop') {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
    }
};
