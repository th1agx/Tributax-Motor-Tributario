import { BadRequestException, Body, Controller, Get, Module, Optional, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { TaxRegime, Uf } from "@tributax/domain";

/**
 * /v1/parties — perfil de partes (payload-spec §13). Regimes são intervalos
 * temporais disjuntos; a decisão datada usa o regime vigente NA DATA da
 * operação, não o atual. Port PartyStore: in-memory default, Postgres em
 * produção (composição no main.ts).
 */
export const PARTY_STORE = "PARTY_STORE";

export interface PartyRegimeInterval {
  readonly regime: TaxRegime;
  readonly validFrom: string; // ISO date
  readonly validTo?: string;
}

export interface PartyEstablishment {
  readonly address: { readonly state: Uf; readonly city?: string };
  readonly taxRegimes: readonly PartyRegimeInterval[];
  readonly municipalRegistration?: string;
}

export interface Party {
  readonly id?: string;
  readonly taxId: string;
  readonly legalName: string;
  readonly type: "COMPANY" | "INDIVIDUAL_ENTREPRENEUR" | "INDIVIDUAL" | "MEI";
  readonly establishments: readonly PartyEstablishment[];
}

export interface PartyStore {
  save(party: Party): Promise<Party>;
  findByIdOrTaxId(ref: string): Promise<Party | undefined>;
}

export class InMemoryPartyStore implements PartyStore {
  private readonly store = new Map<string, Party>();

  async save(party: Party): Promise<Party> {
    const saved = { ...party, id: party.id ?? randomUUID() };
    this.store.set(saved.id!, saved);
    if (saved.taxId) this.store.set(saved.taxId, saved);
    return saved;
  }

  async findByIdOrTaxId(ref: string): Promise<Party | undefined> {
    return this.store.get(ref);
  }
}

/**
 * Instância default COMPARTILHADA: sem DI explícito, PartiesController e
 * TaxDecisionsController precisam enxergar os mesmos perfis.
 */
export const defaultPartyStore = new InMemoryPartyStore();

/** Regime vigente do estabelecimento na data — ou undefined se lacuna. */
export function regimeAt(establishment: PartyEstablishment, asOf: Date): TaxRegime | undefined {
  const day = asOf.toISOString().slice(0, 10);
  return establishment.taxRegimes.find(
    (r) => r.validFrom <= day && (r.validTo === undefined || day < r.validTo),
  )?.regime;
}

/** Emissor resolvido de um party para uma data de operação. */
export interface IssuerProfile {
  readonly state: Uf;
  readonly regime: TaxRegime;
}

export function issuerProfileAt(party: Party, asOf: Date): IssuerProfile | undefined {
  const est = party.establishments[0];
  if (!est) return undefined;
  const regime = regimeAt(est, asOf);
  if (!regime) return undefined;
  return { state: est.address.state, regime };
}

@Controller("/v1/parties")
export class PartiesController {
  private readonly store: PartyStore;

  constructor(@Optional() @Inject(PARTY_STORE) store?: PartyStore) {
    this.store = store ?? defaultPartyStore;
  }

  @Post()
  async create(@Body() body: Party): Promise<Party> {
    if (!body?.taxId || !body?.legalName || !body?.establishments?.length) {
      throw new BadRequestException({
        error: "PAYLOAD_VALIDATION",
        message: "taxId, legalName e ao menos 1 estabelecimento são obrigatórios",
      });
    }
    for (const est of body.establishments) {
      if (!est.address?.state || !est.taxRegimes?.length) {
        throw new BadRequestException({
          error: "PAYLOAD_VALIDATION",
          message: "estabelecimento exige address.state e ao menos 1 intervalo de regime",
        });
      }
      for (const r of est.taxRegimes) {
        if (r.validTo !== undefined && r.validTo <= r.validFrom) {
          throw new BadRequestException({
            error: "PAYLOAD_VALIDATION",
            message: `intervalo de regime inválido: [${r.validFrom}, ${r.validTo})`,
          });
        }
      }
    }
    return this.store.save(body);
  }

  @Get(":ref")
  async find(@Param("ref") ref: string): Promise<Party> {
    const found = await this.store.findByIdOrTaxId(ref);
    if (!found) throw new BadRequestException({ error: "NOT_FOUND", message: `parte ${ref} não encontrada` });
    return found;
  }
}

@Module({ controllers: [PartiesController] })
export class PartiesModule {}
