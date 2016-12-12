importScripts('htslib_worker.js');

onmessage = function(e) {
    t1 = performance.now();
    cmd = e.data[0];
    if (cmd === 0) {
        fd = hts_open(e.data[1]);
        run_pileup(fd);
        hts_close(fd);
    } else if (cmd === 1) {
        fd = hts_open(e.data[1]);
        run_digenome(fd);
        hts_close(fd); 
    }
    t2 = performance.now();
    postMessage([3, (t2 - t1)/1000]);
};
