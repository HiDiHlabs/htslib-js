importScripts('digenome-seq.js');

const prefix = '/data';

progress_callback = function (p) {
    postMessage([1, p]);
};

onmessage = function(e) {
    t1 = performance.now();
    cmd = e.data[0];
    if (cmd === 1) {
        try {
            FS.mkdir(prefix);
        } catch (err) {}
        try {
            FS.unmount(prefix);
        } catch (err) {}
        FS.mount(WORKERFS, {
            files: [e.data[1]]
        }, prefix);
        run_digenome(prefix + '/' + e.data[1].name, 1, 0, 5, 5, 2.5, 10, 0.2);
    }
    t2 = performance.now();
    postMessage([3, (t2 - t1)/1000]);
};