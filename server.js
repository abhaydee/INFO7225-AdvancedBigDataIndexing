const express = require("express");
const session = require("express-session");
const passport = require("passport");
const Ajv = require("ajv");
const schema = require("./schema/schema.json");
const { redisConnection } = require("./controllers/redisConnection");
const { generateETag } = require("./utils/generateEtag");

const app = express();
const ajv = new Ajv();

const validate = ajv.compile(schema);

app.use(express.json());
app.use(
  session({
    secret: "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",
    resave: false,
    saveUninitialized: false,
  })
);

function ensureAuthenticated(req, res, next) {
  const accessToken = req.headers.authorization;
  if (!accessToken) {
    return res.status(401).send("Unauthorized: Access token is required");
  }
  next();
}

let client = "";

app.post("/plan", ensureAuthenticated, async (req, res) => {
  const { body } = req;
  const validCheck = validate(body);
  if (!validCheck) {
    res.status(400).send("Invalid request");
  } else {
    const redisData = await client.set(
      req.body.objectType + ":" + req.body.objectId,
      JSON.stringify(req.body)
    );
    let storedJsonData = await client.get(
      req.body.objectType + ":" + req.body.objectId
    );
    res.status(200).send(JSON.parse(storedJsonData));
  }
});

app.get("/plan", ensureAuthenticated, async (req, res) => {
  try {
    const keys = await client.keys("*");
    const values = await Promise.all(
      keys.map(async (key) => {
        return JSON.parse(await client.get(key));
      })
    );
    console.log("values", values);
    if (values.length == 0) {
      res.sendStatus(204);
    } else {
      res.status(200).send(values);
    }
  } catch (error) {
    res.sendStatus(500);
  }
});

app.get("/plan/:id", ensureAuthenticated, async (req, res) => {
  const data = JSON.parse(await client.get(req.params.id));

  if (!data) {
    res.sendStatus(404);
  }

  const storedETag = generateETag(data);
  if (storedETag == null) {
    res.send(data);
  } else {
    const clientETag = req.headers["if-none-match"];
    if (clientETag) {
      res.sendStatus(304); // Not Modified
    } else {
      res.send(data);
    }
  }
});
app.patch("/plan/:id", ensureAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const updatedBody = req.body;

    const validCheck = validate(updatedBody);

    if (!validCheck) {
      return res.status(400).send("Invalid request");
    }

    const urlETag = req.headers["if-match"] || "";
    if (!urlETag) {
      return res.status(400).send({
        message: "ETag not provided!",
      });
    }

    const eTag = await generateETag(id);

    if (eTag !== urlETag) {
      res.setHeader("ETag", eTag);
      return res.status(412).send({
        message: "ETAG does not match",
      });
    }

    // Get the existing data
    const existingData = JSON.parse(await client.get(id));

    // Create a map of existing linked plan services for efficient lookup
    const existingLinkedPlanServicesMap = new Map(
      existingData.linkedPlanServices.map((service) => [
        service.objectId,
        service,
      ])
    );

    // Filter and update linked plan services
    const updatedLinkedPlanServices = updatedBody.linkedPlanServices.reduce(
      (accumulator, updatedService) => {
        if (!existingLinkedPlanServicesMap.has(updatedService.objectId)) {
          accumulator.push(updatedService); // Add new service
        }
        return accumulator;
      },
      [...existingData.linkedPlanServices]
    ); // Initialize with existing services

    // Update the existing data with filtered linked plan services
    existingData.linkedPlanServices = updatedLinkedPlanServices;

    // Set the updated object with the new key
    await client.set(id, JSON.stringify(existingData));

    const eTagNew = generateETag(id);
    res.setHeader("ETag", eTagNew);

    // Retrieve the updated data
    const updatedData = JSON.parse(await client.get(id));

    return res.status(200).send(updatedData);
  } catch (error) {
    console.error("Error updating data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.delete("/plan/:id", ensureAuthenticated, async (req, res) => {
  const deleteData = await client.del(req.params.id);
  console.log("delete data", deleteData);
  if (deleteData == 1) {
    res.sendStatus(204);
  } else {
    res.sendStatus(404);
  }
});

const server = app.listen(8080, async function () {
  console.log("the server is up and running on port 8080");
  client = await redisConnection();
});
