import QRCode from "qrcode";

/**
 * Generate QR code as data URL
 */
export async function generateQRCode(url: string): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw new Error("Failed to generate QR code");
  }
}

/**
 * ✅ Download QR code with visible "Table X" text below
 */
export async function downloadQRCode(
  url: string,
  fileName: string,
  tableNumber?: number
): Promise<void> {
  try {
    const qrDataUrl = await generateQRCode(url);

    const qrImage = new Image();
    qrImage.crossOrigin = "anonymous";
    qrImage.src = qrDataUrl;

    await new Promise((resolve, reject) => {
      qrImage.onload = resolve;
      qrImage.onerror = reject;
    });

    // ✅ Use actual natural dimensions
    const qrWidth = qrImage.naturalWidth;
    const qrHeight = qrImage.naturalHeight;

    // Padding for layout
    const paddingTop = 20;
    const paddingBottom = 100;
    const width = qrWidth;
    const height = qrHeight + paddingTop + paddingBottom;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d")!;
    if (!ctx) throw new Error("Canvas not supported");

    // ✅ White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    // ✅ Draw QR code
    ctx.drawImage(qrImage, 0, paddingTop, qrWidth, qrHeight);

    // ✅ Draw table number clearly below QR
    if (tableNumber) {
      ctx.fillStyle = "#000000";
      ctx.font = "bold 44px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`Table ${tableNumber}`, width / 2, qrHeight + paddingTop + 20);
    }

    // ✅ Export as PNG and download
    const finalImage = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = finalImage;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error downloading QR code:", error);
    throw new Error("Failed to download QR code");
  }
}

/**
 * ✅ Build QR URL including vendor + table info
 */
export function getTableQRUrl(
  tableId: number,
  tableNumber: number,
  vendorId?: number
): string {
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://quickbite.nexitel.org";

  const qrData = `vendor:${vendorId ?? 1}:table:${tableNumber}`;
  return `${baseUrl}/order/table/${tableId}?qrData=${encodeURIComponent(qrData)}`;
}
