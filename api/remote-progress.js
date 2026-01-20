import axios from "axios";

export default async function handler(req,res){
  const { jobId, server } = req.query;
  if(!jobId || !server)
    return res.status(400).json({ error:"Missing params" });

  try{
    const r = await axios.get(
      `https://${server}.gofile.io/getUploadStatus`,
      { params:{ jobId } }
    );

    res.json(r.data.data);

  }catch(err){
    res.status(500).json({
      error:"Progress fetch failed",
      details:err.message
    });
  }
}
