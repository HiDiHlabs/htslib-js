importScripts('htslib_worker.js');

onmessage = function(e) {
    cmd = e.data[0];
    if (cmd === 0) {
        t1 = performance.now();
        fd = hts_open(e.data[1]);
        test(fd);
        hts_close(fd);
        t2 = performance.now();
        postMessage([2, (t2 - t1)/1000]);
    }
};
