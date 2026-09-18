import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { TaxDecisionsModule } from "./tax-decisions/tax-decisions.controller.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(TaxDecisionsModule);
  app.enableShutdownHooks();
  await app.listen(3000);
}

void bootstrap();
