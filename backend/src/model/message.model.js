const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      trim: true
    },
    mediaUrl: {
      type: String, // Optional: for images, files, or voice notes
      default: ""
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Tracks who has read this message (for read receipts)
      }
    ],
    isRead:{
      type:Boolean,
      default:false
    },
      replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
        default: null
    },
     status: {
    type: String,
    enum: ["sent", "delivered", "seen"],
    default: "sent"
  },
  deliveredAt: Date,
  seenAt: Date

  },
  { timestamps: true } // createdAt automatically acts as the message timestamp
);

module.exports = mongoose.model('Message', messageSchema);