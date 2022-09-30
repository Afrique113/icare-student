import { Injectable } from "@angular/core";
import { Observable, of, throwError, zip } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { OpenmrsHttpClientService } from "src/app/shared/modules/openmrs-http-client/services/openmrs-http-client.service";
import { LedgerInput } from "../models/ledger-input.model";
import { StockBatch } from "../models/stock-batch.model";
import { Stock, StockObject } from "../models/stock.model";
import * as moment from "moment";

@Injectable({
  providedIn: "root",
})
export class StockService {
  constructor(private httpClient: OpenmrsHttpClientService) {}

  getAllStocks(locationUuid?: string): Observable<StockObject[]> {
    return zip(
      this.getAvailableStocks(locationUuid),
      this.getStockOuts(locationUuid)
    ).pipe(
      map((results) => {
        return [...results[0], ...results[1]];
      })
    );
  }

  getAvailableStocks(
    locationUuid?: string,
    params?: { q?: string; limit?: number; startIndex?: number }
  ): Observable<StockObject[]> {
    return this._getStocks("store/stock", locationUuid, params);
  }

  getAvailableStockOfAnItem(
    itemUuid: string,
    locationUuid: string
  ): Observable<any> {
    return this.httpClient
      .get(`store/item/${itemUuid}/stock?locationUuid=${locationUuid}`)
      .pipe(
        map((response) => {
          const stockItem = new Stock(response).toJson();
          const eligibleBatches = (stockItem?.batches || []).filter(
            (batch) => batch.expiryDate > Date.now().toFixed(0)
          );
          let eligibleQuantity = 0;
          if (eligibleBatches?.length === 0) {
          } else {
            eligibleQuantity = eligibleBatches.reduce(
              (sum, stockBatch) => sum + stockBatch.quantity,
              0
            );
          }
          const batchZero = stockItem?.batches[0];
          return {
            ...stockItem,
            eligibleQuantity,
            batches: stockItem?.batches?.map((batch: any) => {
              const expiryDate = moment(new Date(batch.expiryDate));
              return {
                ...batch,
                batchNo: batch?.batch,
                remainingDays: expiryDate.fromNow(),
              };
            }),
            id: itemUuid,
            name: (batchZero as any)?.item?.display,
          };
        }),
        catchError((e) => of(e))
      );
  }

  getStockOuts(locationUuid?: string): Observable<StockObject[]> {
    return this._getStocks("store/stockout", locationUuid);
  }

  saveStockLedger(ledgerInput: LedgerInput): Observable<StockBatch> {
    const storeLedger = Stock.createLedger(ledgerInput);

    if (!storeLedger) {
      return throwError({
        message: "Incorrect parameters supplied",
      });
    }

    return this.httpClient
      .post("store/ledger", storeLedger)
      .pipe(map((response) => new StockBatch(response)));
  }

  getStockMetrics(locationUuid: string) {
    return this.httpClient.get(`store/metrics?location=${locationUuid}`);
  }

  private _getStocks(
    url: string,
    locationUuid?: string,
    params?: any
  ): Observable<StockObject[]> {
    let parameters = [];
    if (params?.q) {
      parameters = [...parameters, `q=${params?.q}`];
    }
    if (params?.limit) {
      parameters = [...parameters, `limit=${params?.limit}`];
    }
    if (params?.limit) {
      parameters = [
        ...parameters,
        `startIndex=${params?.startIndex ? params?.startIndex : 0}`,
      ];
    }
    return this.httpClient
      .get(
        `${url}?locationUuid=${locationUuid}${
          parameters?.length > 0 ? "&" + parameters?.join("&") : ""
        }`
      )
      .pipe(
        map((stockResponse) => {
          const stockBatches: StockBatch[] = (stockResponse || []).map(
            (stockItem) => new StockBatch(stockItem)
          );

          const groupedStockBatches =
            StockBatch.getGroupedStockBatches(stockBatches);

          return Object.keys(groupedStockBatches).map((stockItemKey) => {
            return new Stock(groupedStockBatches[stockItemKey]).toJson();
          });
        })
      );
  }

  // TODO: by Masembo
  getItemStockInAllUnits(itemID: string): Observable<any> {
    return this.httpClient.get(`store/item/${itemID}/stock?itemUuid=${itemID}`);
  }
}

// https://icare.dhis2.udsm.ac.tz/openmrs/ws/rest/v1/store/item/{itemUUID}/stock?itemUuid={itemUUID}
