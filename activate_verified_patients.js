const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

for (const envPath of [path.join(process.cwd(), ".env"), path.join(process.cwd(), "..", ".env")]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const User = require("./auth/userModel");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const result = await User.updateMany(
    { phoneVerifiedAt: { $ne: null }, isActive: false },
    { $set: { isActive: true, role: "patient" } }
  );

  console.log(JSON.stringify({
    matched: result.matchedCount,
    modified: result.modifiedCount
  }));

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
