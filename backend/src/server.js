require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const adminDiagnosticsRoutes = require("./routes/adminDiagnosticsRoutes");
const conviteRoutes = require("./routes/conviteRoutes");
const checkoutRoutes = require("./routes/checkoutRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const { getMercadoPagoEnvironment } = require("./mercadoPago");
const { boletoRouter, pixRouter } = require("./routes/instantPaymentRoutes");

const app = express();

const getCorsOrigins = () => {
  const origins = process.env.CORS_ORIGINS ||
    "https://renovarerp.com.br,http://localhost:5173,http://127.0.0.1:5173";

  return origins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const allowedOrigins = getCorsOrigins();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origem nao permitida pelo CORS."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mercadoPago: getMercadoPagoEnvironment(),
  });
});

app.use("/api/checkout", checkoutRoutes);
app.use("/api/pix", pixRouter);
app.use("/api/boleto", boletoRouter);
app.use("/api/convites", conviteRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/admin", adminDiagnosticsRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  console.error("Erro nao tratado no backend", err);
  res.status(500).json({
    ok: false,
    error: err.message || "Erro interno.",
  });
});

const port = Number(process.env.PORT || 10000);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Backend de pagamentos Renovar ERP ouvindo na porta ${port}`);
  });
}

module.exports = app;
