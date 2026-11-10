const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    isGroupChat: {
      type: Boolean,
      default: false
    },
    groupName: {
      type: String,
      default: "" // Only used if isGroupChat is true
    },
    groupAvatar: {
      type: String,
      default: "" // Group profile picture URL (Cloudinary)
    },
    groupDescription: {
      type: String,
      default: "" // Group description / bio
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User' // Only used if isGroupChat is true
    },
    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message' // Useful for showing chat preview in sidebar list
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);