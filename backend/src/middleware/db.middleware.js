require("dotenv").config();
const mongoose = require("mongoose");

const connectToDatabase = async () => {
    try {
        const uri = process.env.MONGO_URI || "mongodb://localhost:27017/batcheet";
        await mongoose.connect(uri);
        console.log(`Connected to database HOST: ${mongoose.connection.host}`);
    } catch (error) {
        console.error("MONGOOSE ERROR:", error.message);
    }
};

module.exports = connectToDatabase;
