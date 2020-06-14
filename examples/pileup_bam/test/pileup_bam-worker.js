importScripts('pileup_bam.js');

progress_callback = function (p) {
    postMessage([1, p]);
};

onmessage = function(e) {
    t1 = performance.now();
    cmd = e.data[0];
    if (cmd === 1) {
        FS.mkdir(prefix);
        FS.mount(WORKERFS, {
            files: e.data[1]
        }, prefix);
        let bam_file = '';
        let bai_file = '';
        let fasta_file = '';
        let fai_file = '';
        for (let i = 0; i < e.data[1].length; ++i) {
            if (e.data[1][i].name.endsWith('.bam')) {
                bam_file = e.data[1][i].name;
            } else if (e.data[1][i].name.endsWith('.bai')) {
                bai_file = e.data[1][i].name;
            } else if (e.data[1][i].name.endsWith('.fa')) {
                fasta_file = e.data[1][i].name;
            }
        }
        run_pileup(bam_file, bai_file, fasta_file, e.data[5]);
    }
    t2 = performance.now();
    postMessage([3, (t2 - t1)/1000]);
};
