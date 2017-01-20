importScripts('digenome.js');

onmessage = function(e) {
    t1 = performance.now();
    cmd = e.data[0];
    if (cmd === 1) {
        fd = hts_open(e.data[1]);
        run_digenome(fd, 1, 0, 5, 5, 2.5, 10, 0.2);
        hts_close(fd); 
    }
    t2 = performance.now();
    postMessage([3, (t2 - t1)/1000]);
};