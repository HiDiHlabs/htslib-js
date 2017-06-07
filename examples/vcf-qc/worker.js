importScripts('vcf-qc.js');

const rainfall = cwrap('rainfall', null, ['string']);
const prefix = '/data';

let positions = {};
let distances = {};

onmessage = function(e) {
    FS.mkdir(prefix);
    FS.mount(WORKERFS, {
        files: e.data
    }, prefix);

    let vcf_file = '';
    for (let i = 0; i < e.data.length; ++i) {
        if (e.data[i].name.endsWith('.vcf') || e.data[i].name.endsWith('.vcf.gz')) {
            vcf_file = e.data[i].name;
        }
    }

    positions = {};
    distances = {};
    rainfall(prefix + '/' + vcf_file);
    postMessage({
        positions: positions,
        distances: distances
    });
};
