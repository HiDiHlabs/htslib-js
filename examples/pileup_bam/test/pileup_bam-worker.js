importScripts('pileup_bam.js');

progress_callback = function (p) {
    postMessage([1, p]);
};

onmessage = function(e) {
    t1 = performance.now();
    cmd = e.data[0];
    if (cmd === 1) {
        fd_bam = hts_open(e.data[1], progress_callback);
        if (e.data[2])
            fd_bai = hts_open(e.data[2]);
        else
            fd_bai = -1;
        if (e.data[3]) {
            fd_fa = hts_open(e.data[3]);
            fd_fai = hts_open(e.data[4]);
        } else {
            fd_fa = -1;
            fd_fai = -1;
        }
        run_pileup(fd_bam, fd_bai, fd_fa, fd_fai, e.data[5]);
        hts_close(fd_bam); 
        if (fd_bai > 0) hts_close(fd_bai); 
        if (fd_fa > 0) {
           hts_close(fd_fa); 
           hts_close(fd_fai);
        }
    }
    t2 = performance.now();
    postMessage([3, (t2 - t1)/1000]);
};
