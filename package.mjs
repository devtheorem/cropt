// Helper file for the npm run build
// For the classic cropt.js, removes 'export' and attaches wrapper for windows/module/commonjs
import { readFileSync, writeFileSync } from 'fs';
import { argv } from 'process';

const input = argv[2];
const output = argv[3] || input;
let code = readFileSync(input, 'utf8');
// replace & append
code = code.replace('export default Cropt', '');
const appendCode = "if (typeof window !== 'undefined') window.Cropt = Cropt; else if (typeof module !== 'undefined' && module.exports) module.exports = Cropt; else if (typeof define === 'function' && define.amd) define(() => Cropt);";

writeFileSync(output, code + appendCode, 'utf8');