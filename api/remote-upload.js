import axios from "axios";
import FormData from "form-data";

export default async function handler(req,res){
  try{
    if(req.method!=="POST")
      return res.status(405).json({ error:"POST only" });

    const { file_url } = req.body;
    if(!file_url)
      return res.status(400).json({ error:"file_url required" });

    const server =
      (await axios.get("https://api.gofile.io/servers"))
        .data.data.servers[0].name;

    const form = new FormData();
    form.append("fileUrl", file_url);

    const r = await axios.post(
      `https://${server}.gofile.io/uploadFile`,
      form,
      { headers: form.getHeaders() }
    );

    if(r.data.status!=="ok"){
      return res.status(400).json({
        error:"Gofile rejected URL",
        reason:r.data
      });
    }

    res.json({
      jobId: r.data.data.jobId,
      server
    });

  }catch(err){
    res.status(500).json({
      error:"Remote upload failed",
      details:err.message
    });
  }
}