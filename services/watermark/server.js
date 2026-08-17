const express = require('express');
const axios = require('axios');
const sharp = require('sharp');

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'carousel-watermark-service' });
});

function computePosition(position, baseWidth, baseHeight, wmWidth, wmHeight, margin) {
  switch (position) {
    case 'top-right':
      return { left: Math.max(0, baseWidth - wmWidth - margin), top: margin };
    case 'bottom-left':
      return { left: margin, top: Math.max(0, baseHeight - wmHeight - margin) };
    case 'bottom-right':
      return {
        left: Math.max(0, baseWidth - wmWidth - margin),
        top: Math.max(0, baseHeight - wmHeight - margin)
      };
    case 'center':
      return {
        left: Math.max(0, Math.round((baseWidth - wmWidth) / 2)),
        top: Math.max(0, Math.round((baseHeight - wmHeight) / 2))
      };
    case 'top-left':
    default:
      return { left: margin, top: margin };
  }
}

async function applyOpacity(buffer, opacity) {
  if (opacity >= 1) return buffer;

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] * opacity)));
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels
    }
  }).png().toBuffer();
}

app.post('/watermark-image', async (req, res) => {
  try {
    const {
      imageUrl,
      watermarkUrl,
      position = 'top-left',
      scale = 0.12,
      margin = 30,
      opacity = 1,
      outputFormat = 'png'
    } = req.body || {};

    if (!imageUrl || !watermarkUrl) {
      return res.status(400).json({
        error: 'imageUrl and watermarkUrl are required.'
      });
    }

    const [baseResp, watermarkResp] = await Promise.all([
      axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 300000 }),
      axios.get(watermarkUrl, { responseType: 'arraybuffer', timeout: 300000 })
    ]);

    const baseBuffer = Buffer.from(baseResp.data);
    const watermarkBuffer = Buffer.from(watermarkResp.data);

    const base = sharp(baseBuffer);
    const baseMeta = await base.metadata();

    if (!baseMeta.width || !baseMeta.height) {
      return res.status(400).json({
        error: 'Could not read base image dimensions.'
      });
    }

    const targetWidth = Math.max(1, Math.round(baseMeta.width * Number(scale || 0.12)));

    let resizedWatermark = await sharp(watermarkBuffer)
      .resize({ width: targetWidth })
      .png()
      .toBuffer();

    resizedWatermark = await applyOpacity(resizedWatermark, Number(opacity || 1));

    const wmMeta = await sharp(resizedWatermark).metadata();

    const coords = computePosition(
      String(position || 'top-left'),
      baseMeta.width,
      baseMeta.height,
      wmMeta.width || targetWidth,
      wmMeta.height || targetWidth,
      Number(margin || 30)
    );

    const pipeline = base.composite([
      {
        input: resizedWatermark,
        left: coords.left,
        top: coords.top
      }
    ]);

    let outputBuffer;

    if (
      String(outputFormat || 'png').toLowerCase() === 'jpg' ||
      String(outputFormat || 'png').toLowerCase() === 'jpeg'
    ) {
      outputBuffer = await pipeline.jpeg({ quality: 95 }).toBuffer();
      res.setHeader('Content-Type', 'image/jpeg');
    } else {
      outputBuffer = await pipeline.png().toBuffer();
      res.setHeader('Content-Type', 'image/png');
    }

    res.status(200).send(outputBuffer);
  } catch (error) {
    console.error('watermark-image error', error?.response?.data || error.message || error);

    res.status(500).json({
      error: 'Failed to watermark image.',
      detail: error?.response?.data || error.message || String(error)
    });
  }
});

const PORT = process.env.PORT || 3011;

app.listen(PORT, () => {
  console.log(`Carousel watermark service listening on port ${PORT}`);
});
