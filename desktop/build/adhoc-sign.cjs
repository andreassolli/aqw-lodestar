// electron-builder afterPack hook: gives the Mac app an ad-hoc signature.
//
// Without a paid Apple Developer certificate the app can't be properly signed,
// and Apple Silicon Macs refuse to open an app with no valid signature at all
// ("AQW Lodestar is damaged"). An ad-hoc signature fixes that; people still
// confirm opening it once (see desktop/README.md).
// Skipped automatically if you later add a real certificate (CSC_LINK).

const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.CSC_LINK) return;
  // A universal build packs an Intel and an Apple Silicon copy first, then merges
  // them; only the merged app gets signed (signing the halves breaks the merge).
  if (/universal-(x64|arm64)-temp/.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
