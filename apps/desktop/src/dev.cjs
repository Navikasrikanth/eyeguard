const { spawn } = require("node:child_process");
const electronPath = require("electron");

const child = spawn(electronPath, ["./src/main.cjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    EYEGUARD_FRONTEND_URL: process.env.EYEGUARD_FRONTEND_URL || "http://localhost:5173"
  }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
