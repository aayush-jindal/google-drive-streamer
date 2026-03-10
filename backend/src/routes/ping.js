export default async function ping(req, res) {
  return res.status(200).json({ pong: true });
}

