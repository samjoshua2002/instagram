require('dotenv').config();
const mongoose = require('mongoose');
const { AzureOpenAI } = require('openai');

const MONGODB_URI = process.env.MONGODB_URI;
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";

async function testMongo() {
  console.log("Testing MongoDB connection...");
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ MongoDB connected successfully!");
    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
}

async function testAzureOpenAI(deployment) {
  console.log(`Testing Azure OpenAI deployment: ${deployment}...`);
  try {
    const client = new AzureOpenAI({
      endpoint: AZURE_ENDPOINT,
      apiKey: AZURE_API_KEY,
      apiVersion: API_VERSION,
      deployment: deployment
    });

    const response = await client.chat.completions.create({
      messages: [
        { role: "system", content: "You are an assistant. Reply with only one word: 'CONNECTED'." },
        { role: "user", content: "Test ping" }
      ],
      max_tokens: 10,
    });

    console.log(`✅ Azure OpenAI (${deployment}) response:`, response.choices[0].message.content.trim());
    return true;
  } catch (err) {
    console.error(`❌ Azure OpenAI (${deployment}) error:`, err.message);
    return false;
  }
}

async function run() {
  await testMongo();
  const ok1 = await testAzureOpenAI("gpt-4o");
  if (!ok1) {
    await testAzureOpenAI("gpt-5.6-luna");
  }
}

run();
