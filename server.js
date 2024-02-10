let express = require("express");
let app = express();
const schema = require("./schema/schema.json");
const Ajv = require("ajv");
const ajv = new Ajv();

const validate = ajv.compile(schema);
app.use(express.json());
const { redisConnection } = require("./controllers/redisConnection");
const { generateETag } = require("./utils/generateEtag");
let client = "";
//generate etag

//Adding new body to the datastore
app.post("/plan", async (req, res) => {
  const { body } = req;
  const validCheck = validate(body);
  if (!validCheck) {
    res.sendStatus(304);
  } else {
    const redisData = await client.set(
      req.body.objectType + ":" + req.body.objectId,
      JSON.stringify(req.body)
    );
    let storedJsonData = await client.get(
      req.body.objectType + ":" + req.body.objectId
    );
    console.log("stored json data", storedJsonData);
    res.status(200).send(storedJsonData);
  }
});

app.get("/plan", async (req, res) => {
  try {
    const keys = await client.keys("*");
    const values = await Promise.all(
      keys.map(async (key) => {
        return JSON.parse(await client.get(key));
      })
    );
    res.status(200).send(values);
  } catch (error) {
    res.sendStatus(500);
  }
});
//get the json from the datastore
app.get("/plan/:id", async (req, res) => {
  const data = JSON.parse(await client.get(req.params.id));

  if (!data) {
    res.sendStatus(404);
  }

  const storedETag = generateETag(data);

  if (storedETag == null) {
    console.log("hitting here");
    res.send(data);
  } else {
    const clientETag = req.headers["if-none-match"];
    console.log(
      "the client etag and the stored etag ",
      typeof clientETag + " : " + storedETag
    );
    if (clientETag && clientETag.trim() == storedETag.trim()) {
      console.log("hitting match");
      res.sendStatus(304); // Not Modified
    } else {
      console.log("hitting non match");
      console.log("the stored etag", storedETag);
      res.send(data);
    }
  }
});

//delete the item from the datastore
app.delete("/plan/:id", async (req, res) => {
  const deleteData = await client.del(req.params.id);
  console.log("delete data", deleteData);
  if (deleteData == 1) {
    res.sendStatus(204);
  } else {
    res.sendStatus(404);
  }
});

//running the nodejs server
let server = app.listen(8080, async function (req, res) {
  console.log("the server is up and running on port 8080");
  client = await redisConnection();
});
