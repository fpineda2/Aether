//Api for Posts 
import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import { connectDB } from "../../lib/mongoose"
import Post from "../../models/Post"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)

  if (!session) {
    return res.status(401).json({ error: "Not authenticated" })
  }

  await connectDB()

  if (req.method === "POST") {
    const { text } = req.body
    if (!text) return res.status(400).json({ error: "Text required" })

    const post = await Post.create({
      text,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      },
    })

    return res.status(201).json(post)
  }

  if (req.method === "GET") {
    const posts = await Post.find().sort({ createdAt: -1 })
    return res.status(200).json(posts)
  }

  res.status(405).json({ error: "Method not allowed" })
}
