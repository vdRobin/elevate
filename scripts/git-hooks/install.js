// Point git at the committed hooks in .husky/ (run by "npm install" through the root "prepare" script).
//
// Only sets core.hooksPath: no hook files are generated, so .husky/* stay exactly as committed.
// Outside a git checkout (e.g. a source tarball) or without git, prints a hint and never fails the install.

const { execFileSync } = require("child_process");

const git = args =>
  execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();

try {
  if (git(["rev-parse", "--is-inside-work-tree"]) === "true") {
    git(["config", "core.hooksPath", ".husky"]);
  }
} catch (err) {
  console.warn("Git hooks not installed (run 'git config core.hooksPath .husky' manually).");
}
