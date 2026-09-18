import "reflect-metadata";
import { seedRuleCatalog } from "./postgres-rule-source.js";

/** CLI: npm run seed — popula tax_rules com o catálogo-padrão do domínio. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL é obrigatório para o seed");
    process.exit(1);
  }
  const count = await seedRuleCatalog(url);
  console.log(`seed concluído: ${count} regras inseridas (id+versão existentes ignoradas)`);
}

void main();
