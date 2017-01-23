function run_pileup(fd_bam, fd_bai, fd_fa, fd_fai, reg) {
    var func = cwrap('run_pileup', 'number', ['number', 'number', 'number', 'number', 'string']);
    func(fd_bam, fd_bai, fd_fa, fd_fai, reg);
}
self["run_pileup"] = run_pileup;

