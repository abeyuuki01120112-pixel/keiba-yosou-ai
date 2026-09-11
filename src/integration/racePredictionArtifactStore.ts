/** Race Prediction Artifactのappend-only JSON保存境界。 */

import fs from "node:fs";
import path from "node:path";
import { keibaDataSubdir } from "../config/keibaDataDir";
import {
  deserializeRacePredictionArtifact,
  serializeRacePredictionArtifact,
  type RacePredictionArtifact,
} from "./racePredictionArtifact";

export const DEFAULT_RACE_PREDICTION_ARTIFACT_DIR = keibaDataSubdir("predictions");

export interface RacePredictionArtifactStoreOptions {
  dir?: string;
}

export type PersistRacePredictionArtifactResult =
  | { status: "created"; artifactId: string; path: string }
  | { status: "duplicate"; artifactId: string; path: string }
  | { status: "rejected"; artifactId: string; path: string; reason: string };

export function persistRacePredictionArtifact(
  artifact: RacePredictionArtifact,
  options: RacePredictionArtifactStoreOptions = {},
): PersistRacePredictionArtifactResult {
  // serialize/deserializeを先に通し、不正・改変済みArtifactを保存しない。
  const serialized = serializeRacePredictionArtifact(artifact);
  deserializeRacePredictionArtifact(serialized);
  const dir = options.dir ?? DEFAULT_RACE_PREDICTION_ARTIFACT_DIR;
  const filePath = path.join(dir, `${artifact.artifactId}.json`);

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    try {
      const existingArtifact = deserializeRacePredictionArtifact(existing);
      if (existingArtifact.predictionContentFingerprint === artifact.predictionContentFingerprint) {
        return { status: "duplicate", artifactId: artifact.artifactId, path: filePath };
      }
    } catch {
      // 破損した既存ファイルも黙って上書きしない。
    }
    return {
      status: "rejected",
      artifactId: artifact.artifactId,
      path: filePath,
      reason: "同一artifactIdのPrediction Artifactは変更・上書きできません。",
    };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, serialized, "utf-8");
  return { status: "created", artifactId: artifact.artifactId, path: filePath };
}

export function readRacePredictionArtifact(
  artifactId: string,
  options: RacePredictionArtifactStoreOptions = {},
): RacePredictionArtifact | null {
  if (path.basename(artifactId) !== artifactId || artifactId.includes(path.sep)) {
    throw new Error("artifactIdが不正です");
  }
  const dir = options.dir ?? DEFAULT_RACE_PREDICTION_ARTIFACT_DIR;
  const filePath = path.join(dir, `${artifactId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return deserializeRacePredictionArtifact(fs.readFileSync(filePath, "utf-8"));
}
