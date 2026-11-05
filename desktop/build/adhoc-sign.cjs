// Ad-hoc signs the Mac app after packing. Without a paid Apple certificate
// Apple Silicon says the app is "damaged", and this fixes that. Skipped if you
// add a real certificate (CSC_LINK).

const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.CSC_LINK) return;
  // Universal builds make an Intel and an ARM copy and merge them. Only sign the
  // merged one, signing the halves breaks the merge.
  if (/universal-(x64|arm64)-temp/.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
