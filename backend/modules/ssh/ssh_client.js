const { Client } = require("ssh2");

function execSSH({ host, port = 22, username, password, command }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    const start = Date.now();

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          let output = "";
          let error = "";

          stream
            .on("close", (code) => {
              conn.end();

              const execMs = Date.now() - start;

              if (code === 0) {
                resolve({ success: true, output, execMs });
              } else {
                resolve({ success: false, error, execMs });
              }
            })
            .on("data", (data) => {
              output += data.toString();
            });

          stream.stderr.on("data", (data) => {
            error += data.toString();
          });
        });
      })
      .on("error", (err) => {
        reject(err);
      })
      .connect({
        host,
        port,
        username,
        password
      });
  });
}

module.exports = { execSSH };
