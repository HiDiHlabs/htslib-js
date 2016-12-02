importScripts('htslib_worker.js');

onmessage = function(e) {
    cmd = e.data[0];
    if (cmd === 0) {
        fd = hts_open(e.data[1]);
        test(fd);
        hts_close(fd);
    }
};
