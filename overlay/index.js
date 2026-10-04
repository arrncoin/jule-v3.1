const fs = require("fs");
const path = require("path");

const overlayPath =
path.join(__dirname,"state/overlay.json");


fs.writeFileSync(
    overlayPath,
    JSON.stringify({
        mode:"dashboard",
        type:"idle",
        message:"Menunggu aktivitas..."
    },null,2)
);