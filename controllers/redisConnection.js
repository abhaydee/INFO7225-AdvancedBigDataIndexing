const { createClient } = require("redis");
let client = "";

//database connection
const redisConnection = async () => {
  client = createClient();
  client.on("error", (err) => console.log("Redis Client Error", err));
  await client.connect();
  return client;
};

module.exports = { redisConnection };
