import mongoose from "mongoose"

const PostSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    user: {
      id: { type: String, required: true },
      name: String,
      email: String,
      image: String,
    },
  },
  { timestamps: true }
)

export default mongoose.models.Post || mongoose.model("Post", PostSchema)
