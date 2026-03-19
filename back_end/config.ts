import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import dotenv from "dotenv";

const region = "us-east-1";

async function getSecret(secretName: string) {
  const secretsClient = new SecretsManagerClient({ region });
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

async function getParameter(name: string) {
  const ssmClient = new SSMClient({ region });
  const response = await ssmClient.send(
    new GetParameterCommand({ Name: name })
  );
  return response.Parameter!.Value!;
}

export async function loadConfig() {
  if (process.env.NODE_ENV === 'production') {
    // Fetch RDS credentials from Secrets Manager
    const rdsSecret = await getSecret("requestbin/rds");
    // Fetch DocumentDB credentials from Secrets Manager
    const docdbSecret = await getSecret("requestbin/docdb");
    // Fetch params from Parameter Store
    const dbName = await getParameter("/requestbin/db/name");
    const port = await getParameter("/requestbin/app/port");

    process.env.PGUSER = rdsSecret.username;
    process.env.PGPASSWORD = rdsSecret.password;
    process.env.PGHOST = rdsSecret.host;
    process.env.PGPORT = rdsSecret.port.toString();
    process.env.PGDATABASE = dbName;

    process.env.MONGODB_URI = `mongodb://${docdbSecret.username}:${docdbSecret.password}@${docdbSecret.host}:${docdbSecret.port}/?tls=true&tlsCAFile=/etc/ssl/certs/global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;

    console.log("Config loaded from AWS.");
  } else {
    dotenv.config();
    console.log("Config loaded from .env.");
  }
}