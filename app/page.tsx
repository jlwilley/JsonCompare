"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "../components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../components/ui/dialog";
import { isEqual } from "lodash";
import { UploadCloud, Github, ExternalLink } from "lucide-react";

// --- Interface Definitions ---
interface JsonEntry {
  [key: string]: unknown;
}

interface FieldChanges {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { before: unknown; after: unknown }>;
}

interface ModifiedEntry {
  keyFieldValue: string; // The value of the key field used for matching
  keyFieldUsed: string; // The name of the key field used for this entry
  objectSignature: string; // Signature of the object (sorted keys)
  before: JsonEntry; // State of the entry before changes
  after: JsonEntry; // State of the entry after changes
  changes: FieldChanges; // Detailed field-level changes
}

interface ComparisonResult {
  newEntries: (JsonEntry & {
    objectSignature: string;
    keyFieldUsed?: string; // Key field used if applicable (e.g., for display)
  })[];
  modifiedEntries: ModifiedEntry[];
  deletedEntries: (JsonEntry & {
    objectSignature: string;
    keyFieldUsed?: string; // Key field used if applicable
  })[];
  errors: string[]; // Any errors or warnings generated during comparison
}

// Represents the structure of a type of JSON object found in the input
interface JsonObjectStructure {
  signature: string; // A unique signature, e.g., "age,name,id"
  keys: string[]; // All distinct keys found across instances of this structure
  count: number; // How many objects of this structure were found
  potentialKeyFields: string[]; // Validated string keys suitable for unique identification
}

// Configuration mapping an object signature to its chosen key field for comparison
interface SelectedKeyConfig {
  [signature: string]: string;
}

// --- Helper Functions ---

/**
 * Generates a consistent signature for a JSON object based on its sorted keys.
 * @param obj The JSON object.
 * @returns A string signature (e.g., "age,id,name").
 */
const getObjectSignature = (obj: JsonEntry): string => {
  return Object.keys(obj).sort().join(",");
};

/**
 * Analyzes a JSON string to identify distinct object structures and potential key fields.
 * @param jsonString The JSON string (expected to be an array of objects).
 * @returns An object containing identified structures or an error message.
 */
const analyzeJsonStructures = (
  jsonString: string
): { structures: JsonObjectStructure[]; error?: string } => {
  if (!jsonString.trim()) {
    return { structures: [] };
  }
  try {
    const parsed: unknown = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      return {
        structures: [],
        error: "Input JSON must be an array of objects.",
      };
    }
    // Ensure all items in the array are actual objects (not null or other types)
    if (parsed.some((item) => typeof item !== "object" || item === null)) {
      return {
        structures: [],
        error: "All items in the JSON array must be objects.",
      };
    }

    // Group objects by their signature to analyze structures
    const structureMap = new Map<
      string,
      { keys: Set<string>; instances: JsonEntry[] }
    >();

    for (const item of parsed as JsonEntry[]) {
      // This null check is slightly redundant due to the .some() check above,
      // but ensures type safety within the loop.
      if (typeof item !== "object" || item === null) continue;
      const signature = getObjectSignature(item);
      if (!structureMap.has(signature)) {
        structureMap.set(signature, {
          keys: new Set(Object.keys(item)),
          instances: [],
        });
      }
      structureMap.get(signature)!.instances.push(item);
      // Ensure all keys from all instances are collected for the signature
      Object.keys(item).forEach((k) =>
        structureMap.get(signature)!.keys.add(k)
      );
    }

    const structures: JsonObjectStructure[] = [];
    for (const [signature, data] of structureMap.entries()) {
      const potentialKeys: string[] = [];
      // Identify potential keys: must be a non-empty string in ALL instances of this structure
      if (data.instances.length > 0) {
        const firstInstanceKeys = Object.keys(data.instances[0]);
        for (const key of firstInstanceKeys) {
          if (
            data.instances.every(
              (instance) =>
                Object.prototype.hasOwnProperty.call(instance, key) &&
                typeof instance[key] === "string" &&
                (instance[key] as string).trim() !== ""
            )
          ) {
            potentialKeys.push(key);
          }
        }
      }
      structures.push({
        signature,
        keys: Array.from(data.keys).sort(),
        count: data.instances.length,
        potentialKeyFields: potentialKeys.sort(),
      });
    }
    // Sort structures by signature for consistent display order
    return {
      structures: structures.sort((a, b) =>
        a.signature.localeCompare(b.signature)
      ),
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      return { structures: [], error: `JSON Parsing Error: ${e.message}` };
    }
    return { structures: [], error: "An unknown JSON parsing error occurred." };
  }
};

/**
 * Renders a visual detail of an added, removed, or changed field.
 */
const DiffDetail: React.FC<{
  title: string; // e.g., "Added Field", "Before", "After"
  data: Record<string, unknown> | null; // The data to display (often a single key-value pair or portion of an object)
  itemKey?: string; // The specific field name being highlighted
  changeType: "added" | "removed" | "changed-before" | "changed-after";
}> = ({ title, data, itemKey, changeType }) => {
  // Don't render if there's no relevant data for added/removed sections
  if (!data || Object.keys(data).length === 0) {
    if (changeType === "added" || changeType === "removed") return null;
  }

  let bgColor = "";
  if (changeType === "added") bgColor = "bg-green-50 dark:bg-green-900/30";
  else if (changeType === "removed") bgColor = "bg-red-50 dark:bg-red-900/30";
  else if (changeType === "changed-before")
    bgColor = "bg-red-50 dark:bg-red-900/30";
  else if (changeType === "changed-after")
    bgColor = "bg-green-50 dark:bg-green-900/30";

  return (
    <div className={`p-3 rounded-md shadow-sm ${bgColor} mb-3`}>
      <h4 className="font-semibold text-sm mb-1">
        {title} {itemKey && `(Field: ${itemKey})`}
      </h4>
      <pre className="text-xs whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

// --- Main Application Component ---
export default function App() {
  const [beforeJsonString, setBeforeJsonString] = useState<string>("");
  const [afterJsonString, setAfterJsonString] = useState<string>("");

  // State for JSON structure analysis and user-selected key configurations
  const [beforeJsonStructures, setBeforeJsonStructures] = useState<
    JsonObjectStructure[]
  >([]);
  const [afterJsonStructures, setAfterJsonStructures] = useState<
    JsonObjectStructure[]
  >([]);
  const [selectedKeyConfig, setSelectedKeyConfig] = useState<SelectedKeyConfig>(
    {}
  );
  // Combined unique signatures from both before and after JSONs for UI rendering
  const [combinedSignatures, setCombinedSignatures] = useState<string[]>([]);

  const [comparisonResult, setComparisonResult] =
    useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string>("");
  const [fileNameBefore, setFileNameBefore] = useState<string>("");
  const [fileNameAfter, setFileNameAfter] = useState<string>("");

  // State for the currently selected modified entry to show details in a modal
  const [selectedModifiedEntry, setSelectedModifiedEntry] =
    useState<ModifiedEntry | null>(null);

  const fileInputBeforeRef = useRef<HTMLInputElement>(null);
  const fileInputAfterRef = useRef<HTMLInputElement>(null);

  // Effect to re-analyze JSON structures whenever the input strings change.
  useEffect(() => {
    setError(""); // Clear previous general errors before new analysis
    const { structures: beforeStructures, error: beforeError } =
      analyzeJsonStructures(beforeJsonString);
    setBeforeJsonStructures(beforeStructures);
    if (beforeError && beforeJsonString.trim())
      setError((prev) => `${prev} Before JSON Error: ${beforeError}`.trim());

    const { structures: afterStructures, error: afterError } =
      analyzeJsonStructures(afterJsonString);
    setAfterJsonStructures(afterStructures);
    if (afterError && afterJsonString.trim())
      setError((prev) => `${prev} After JSON Error: ${afterError}`.trim());

    // Attempt to auto-select a key if a structure has only one potential key field
    // and no key has been manually selected for it yet.
    const newSelectedKeys = { ...selectedKeyConfig };
    let changedByAutoSelect = false;
    // Consider structures from both before and after for auto-selection candidates.
    // This ensures if a structure appears in one file, its key might be pre-selected.
    const allAnalyzedStructures = new Map<string, JsonObjectStructure>();
    beforeStructures.forEach((s) => allAnalyzedStructures.set(s.signature, s));
    afterStructures.forEach((s) => {
      // Prioritize 'after' if signature collision (though unlikely for full analysis)
      if (
        !allAnalyzedStructures.has(s.signature) ||
        allAnalyzedStructures.get(s.signature)!.potentialKeyFields.length === 0
      ) {
        allAnalyzedStructures.set(s.signature, s);
      }
    });

    allAnalyzedStructures.forEach((s) => {
      if (s.potentialKeyFields.length === 1 && !newSelectedKeys[s.signature]) {
        newSelectedKeys[s.signature] = s.potentialKeyFields[0];
        changedByAutoSelect = true;
      }
    });
    if (changedByAutoSelect) {
      setSelectedKeyConfig(newSelectedKeys);
    }
    // Dependency on selectedKeyConfig is included here to allow re-evaluation if it's externally cleared,
    // though primary triggers are before/afterJsonString.
  }, [beforeJsonString, afterJsonString, selectedKeyConfig]);

  // Effect to update the list of combined unique signatures when structures change.
  useEffect(() => {
    const allSigs = new Set<string>();
    beforeJsonStructures.forEach((s) => allSigs.add(s.signature));
    afterJsonStructures.forEach((s) => allSigs.add(s.signature));
    setCombinedSignatures(Array.from(allSigs).sort());
  }, [beforeJsonStructures, afterJsonStructures]);

  /**
   * Handles changes to the selected key field for a given object signature.
   */
  const handleKeySelectionChange = (signature: string, keyField: string) => {
    setSelectedKeyConfig((prev) => ({ ...prev, [signature]: keyField }));
  };

  /**
   * Calculates field-level changes between two objects.
   */
  const calculateFieldChanges = (
    obj1: Record<string, unknown>,
    obj2: Record<string, unknown>
  ): FieldChanges => {
    const changes: FieldChanges = {
      added: {},
      removed: {},
      changed: {},
    };
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    allKeys.forEach((key) => {
      const val1 = obj1[key];
      const val2 = obj2[key];

      const obj1HasKey = Object.prototype.hasOwnProperty.call(obj1, key);
      const obj2HasKey = Object.prototype.hasOwnProperty.call(obj2, key);

      if (!obj1HasKey && obj2HasKey) {
        changes.added[key] = val2; // Field added in obj2
      } else if (obj1HasKey && !obj2HasKey) {
        changes.removed[key] = val1; // Field removed from obj2
      } else if (obj1HasKey && obj2HasKey && !isEqual(val1, val2)) {
        changes.changed[key] = { before: val1, after: val2 }; // Field value changed
      }
      // If keys are present in both and values are equal, no change is recorded.
    });
    return changes;
  };

  /**
   * Core function to compare the 'Before' and 'After' JSON data.
   */
  const compareJsons = useCallback(() => {
    setError(""); // Reset general error messages.
    setComparisonResult(null); // Clear previous results.
    const localErrors: string[] = []; // Collect warnings/errors specific to this comparison run.

    if (!beforeJsonString.trim() || !afterJsonString.trim()) {
      setError("Both 'Before JSON' and 'After JSON' must be provided.");
      return;
    }

    // Parse JSON strings; basic validation for array type.
    let beforeData: JsonEntry[], afterData: JsonEntry[];
    try {
      beforeData = JSON.parse(beforeJsonString);
      if (!Array.isArray(beforeData))
        throw new Error("'Before JSON' must be an array of objects.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(`Error parsing 'Before JSON': ${message}`);
      return;
    }
    try {
      afterData = JSON.parse(afterJsonString);
      if (!Array.isArray(afterData))
        throw new Error("'After JSON' must be an array of objects.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(`Error parsing 'After JSON': ${message}`);
      return;
    }

    // Validate that key fields are selected for all structures common to both JSONs.
    const activeSignatures = new Set<string>();
    beforeData.forEach((item) => {
      if (typeof item === "object" && item !== null)
        activeSignatures.add(getObjectSignature(item));
    });
    afterData.forEach((item) => {
      if (typeof item === "object" && item !== null)
        activeSignatures.add(getObjectSignature(item));
    });

    for (const sig of Array.from(activeSignatures)) {
      const isInBefore = beforeJsonStructures.some((s) => s.signature === sig);
      const isInAfter = afterJsonStructures.some((s) => s.signature === sig);
      // A key configuration is only mandatory if the structure exists in BOTH files.
      if (isInBefore && isInAfter && !selectedKeyConfig[sig]) {
        setError(
          `Please select a key field for object structure: [${sig
            .split(",")
            .join(", ")}] which is present in both JSON inputs.`
        );
        return;
      }
    }

    // Use Maps for efficient lookup of entries by their key field value.
    const beforeMap = new Map<
      string, // Key value
      { item: JsonEntry; signature: string; keyField: string }
    >();
    const afterMap = new Map<
      string, // Key value
      { item: JsonEntry; signature: string; keyField: string }
    >();

    // Populate beforeMap, validating key fields for mapped items.
    for (const item of beforeData) {
      if (typeof item !== "object" || item === null) {
        localErrors.push(
          `Skipping non-object item in 'Before JSON': ${JSON.stringify(item)}`
        );
        continue;
      }
      const signature = getObjectSignature(item);
      const keyField = selectedKeyConfig[signature];

      // If no keyField is configured for this signature, this item cannot be mapped for comparison.
      // It will be caught later as a 'deleted' item if its signature doesn't appear in 'afterData'.
      if (!keyField) continue;

      if (
        !Object.prototype.hasOwnProperty.call(item, keyField) ||
        typeof item[keyField] !== "string" ||
        (item[keyField] as string).trim() === ""
      ) {
        localErrors.push(
          `Invalid or missing key field '${keyField}' for an object with signature [${signature}] in 'Before JSON'. Value: ${item[keyField]}`
        );
        continue; // Skip mapping this item if its key is invalid.
      }
      const keyValue = item[keyField] as string;
      if (beforeMap.has(keyValue)) {
        localErrors.push(
          `Warning: Duplicate key value '${keyValue}' (using key '${keyField}') found in 'Before JSON' for signature [${signature}]. The last entry with this key will be used for comparison.`
        );
      }
      beforeMap.set(keyValue, { item, signature, keyField });
    }

    // Populate afterMap, similarly validating key fields.
    for (const item of afterData) {
      if (typeof item !== "object" || item === null) {
        localErrors.push(
          `Skipping non-object item in 'After JSON': ${JSON.stringify(item)}`
        );
        continue;
      }
      const signature = getObjectSignature(item);
      const keyField = selectedKeyConfig[signature];

      if (!keyField) continue; // Will be caught as 'new' if signature not in 'beforeData'.

      if (
        !Object.prototype.hasOwnProperty.call(item, keyField) ||
        typeof item[keyField] !== "string" ||
        (item[keyField] as string).trim() === ""
      ) {
        localErrors.push(
          `Invalid or missing key field '${keyField}' for an object with signature [${signature}] in 'After JSON'. Value: ${item[keyField]}`
        );
        continue;
      }
      const keyValue = item[keyField] as string;
      if (afterMap.has(keyValue)) {
        localErrors.push(
          `Warning: Duplicate key value '${keyValue}' (using key '${keyField}') found in 'After JSON' for signature [${signature}]. The last entry with this key will be used.`
        );
      }
      afterMap.set(keyValue, { item, signature, keyField });
    }

    const newEntries: ComparisonResult["newEntries"] = [];
    const modifiedEntries: ModifiedEntry[] = [];
    const deletedEntries: ComparisonResult["deletedEntries"] = [];

    // Identify new and modified entries by iterating through the 'after' data.
    for (const item of afterData) {
      if (typeof item !== "object" || item === null) continue;
      const signature = getObjectSignature(item);
      const keyField = selectedKeyConfig[signature];

      // If no keyField, this structure might be unique to 'afterData' or key wasn't configured.
      if (!keyField) {
        newEntries.push({ ...item, objectSignature: signature });
        continue;
      }

      const keyValue = item[keyField] as string;
      const afterEntry = afterMap.get(keyValue); // Retrieve from map to ensure it passed validation.

      if (afterEntry) {
        // Process only if item was validly mapped.
        if (!beforeMap.has(keyValue)) {
          // Entry is in 'after' but not in 'before' (based on key value).
          newEntries.push({
            ...afterEntry.item,
            objectSignature: signature,
            keyFieldUsed: keyField,
          });
        } else {
          const beforeEntry = beforeMap.get(keyValue)!;
          // Entry found in both 'before' and 'after' based on key value.
          // Critical check: compare signatures. If different, it's a delete of old and add of new.
          if (beforeEntry.signature !== afterEntry.signature) {
            deletedEntries.push({
              ...beforeEntry.item,
              objectSignature: beforeEntry.signature,
              keyFieldUsed: beforeEntry.keyField,
            });
            newEntries.push({
              ...afterEntry.item,
              objectSignature: afterEntry.signature,
              keyFieldUsed: afterEntry.keyField,
            });
          } else if (!isEqual(beforeEntry.item, afterEntry.item)) {
            // Signatures match and objects are not deeply equal: modified.
            const changes = calculateFieldChanges(
              beforeEntry.item,
              afterEntry.item
            );
            // Avoid flagging the key field itself as 'changed' if its value is identical
            // (isEqual might catch type differences that we don't care about for the key itself).
            if (
              changes.changed[keyField] &&
              isEqual(beforeEntry.item[keyField], afterEntry.item[keyField])
            ) {
              delete changes.changed[keyField];
            }
            // Only consider modified if there are actual field changes after key field check.
            if (
              Object.keys(changes.added).length > 0 ||
              Object.keys(changes.removed).length > 0 ||
              Object.keys(changes.changed).length > 0
            ) {
              modifiedEntries.push({
                keyFieldValue: keyValue,
                keyFieldUsed: keyField,
                objectSignature: signature,
                before: beforeEntry.item,
                after: afterEntry.item,
                changes,
              });
            }
          }
        }
      }
    }

    // Identify deleted entries by iterating through 'before' data.
    for (const item of beforeData) {
      if (typeof item !== "object" || item === null) continue;
      const signature = getObjectSignature(item);
      const keyField = selectedKeyConfig[signature];

      if (!keyField) {
        // A simpler check: if this item's structure has no configured key, and it wasn't handled as part of a signature change, it's deleted.
        // However, the more robust check is based on presence in afterMap.
        // The primary logic for deletions where keys EXIST is covered below.
        // This path is for structures that were ONLY in 'before'.
        const isPotentiallyDeleted = !afterData.some((afterItem) => {
          if (typeof afterItem === "object" && afterItem !== null) {
            return getObjectSignature(afterItem) === signature;
          }
          return false;
        });
        if (isPotentiallyDeleted) {
          deletedEntries.push({ ...item, objectSignature: signature });
        }
        continue;
      }
      const keyValue = item[keyField] as string;
      const beforeEntry = beforeMap.get(keyValue); // Use from map to ensure it was valid.

      // If in beforeMap (valid key) and not in afterMap (key not found in after), it's deleted.
      // Also ensure it wasn't part of a signature change pair (already added to deletedEntries).
      if (beforeEntry && !afterMap.has(keyValue)) {
        const alreadyDeletedDueToSigChange = deletedEntries.some(
          (de) =>
            de.objectSignature === beforeEntry.signature &&
            de[beforeEntry.keyField] === keyValue
        );
        if (!alreadyDeletedDueToSigChange) {
          deletedEntries.push({
            ...beforeEntry.item,
            objectSignature: signature,
            keyFieldUsed: keyField,
          });
        }
      }
    }

    // Deduplicate entries that might have been added to new/deleted due to signature changes
    // and also processed by simple key presence/absence.
    // This is a common source of complexity in diffing algorithms.
    // A unique ID for each entry (e.g., original index + file source) could simplify this.
    // For now, filter based on keyFieldValue and signature.
    const makeEntryId = (
      entry: JsonEntry,
      sig: string,
      keyConf: SelectedKeyConfig
    ) => {
      const kf = keyConf[sig];
      return kf ? `${sig}::${entry[kf]}` : `${sig}::${JSON.stringify(entry)}`;
    };

    const finalNewEntries = Array.from(
      new Map(
        newEntries.map((e) => [
          makeEntryId(e, e.objectSignature, selectedKeyConfig),
          e,
        ])
      ).values()
    );

    const finalDeletedEntries = Array.from(
      new Map(
        deletedEntries.map((e) => [
          makeEntryId(e, e.objectSignature, selectedKeyConfig),
          e,
        ])
      ).values()
    );

    setComparisonResult({
      newEntries: finalNewEntries,
      modifiedEntries, // Modified entries are inherently unique by keyFieldValue for a given signature.
      deletedEntries: finalDeletedEntries,
      errors: localErrors,
    });

    // If there were local errors during comparison, and no general error was set from parsing/setup, display them.
    if (localErrors.length > 0 && !error.includes("Comparison warnings:")) {
      setError((prev) =>
        `${prev} Comparison warnings: ${localErrors.join("; ")}`.trim()
      );
    }
  }, [
    beforeJsonString,
    afterJsonString,
    selectedKeyConfig,
    beforeJsonStructures, // Used for validation messages
    afterJsonStructures, // Used for validation messages
    error, // Included to prevent re-triggering if error already contains warnings
  ]);

  /**
   * Handles file selection for 'Before' or 'After' JSON.
   */
  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "before" | "after"
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== "application/json") {
        setError(
          `Error: ${
            type === "before" ? "Before" : "After"
          } file must be a JSON file.`
        );
        // Reset file input to allow re-selection of the same file if corrected
        if (type === "before" && fileInputBeforeRef.current)
          fileInputBeforeRef.current.value = "";
        if (type === "after" && fileInputAfterRef.current)
          fileInputAfterRef.current.value = "";
        // Clear file name display
        if (type === "before") setFileNameBefore("");
        else setFileNameAfter("");
        return;
      }
      setError(""); // Clear previous errors

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          if (type === "before") {
            setBeforeJsonString(content);
            setFileNameBefore(file.name);
            setBeforeJsonStructures([]); // Clear potentially stale structures
            setSelectedKeyConfig({}); // Reset key configuration as new data is loaded
          } else {
            setAfterJsonString(content);
            setFileNameAfter(file.name);
            setAfterJsonStructures([]);
            setSelectedKeyConfig({});
          }
        } catch (loadError: unknown) {
          let message = "Unknown error occurred during file load.";
          if (loadError instanceof Error) {
            message = loadError.message;
          }
          setError(`Error reading file ${file.name}: ${message}`);
          if (type === "before") setFileNameBefore("");
          else setFileNameAfter("");
        }
      };
      reader.onerror = () => {
        // This event fires for general read errors (e.g., permission issues)
        setError(`Error reading file ${file.name}.`);
        if (type === "before") setFileNameBefore("");
        else setFileNameAfter("");
      };
      reader.readAsText(file);
    } else {
      // No file selected, clear file name
      if (type === "before") setFileNameBefore("");
      else setFileNameAfter("");
    }
    // Clear the input value to allow re-selecting the same file after an error or successful upload
    if (event.target) {
      event.target.value = "";
    }
  };

  /**
   * Determines if the 'Compare JSONs' button should be disabled.
   */
  const isCompareDisabled = () => {
    if (!beforeJsonString.trim() || !afterJsonString.trim()) return true;

    // Check if key fields are selected for all structures that are common to both JSON inputs.
    for (const sig of combinedSignatures) {
      const isInBefore = beforeJsonStructures.some((s) => s.signature === sig);
      const isInAfter = afterJsonStructures.some((s) => s.signature === sig);
      // If a structure is present in both, a key must be selected for it.
      if (isInBefore && isInAfter && !selectedKeyConfig[sig]) {
        return true;
      }
    }
    return false;
  };

  // The main container div uses min-h-screen and a background color
  // to ensure the color covers the entire viewport.
  return (
    <div className="container mx-auto p-4 md:p-8 min-h-screen flex flex-col items-center bg-gray-100 text-gray-900 dark:text-gray-50 font-inter">
      <Card className="w-full max-w-5xl shadow-lg rounded-xl flex flex-col overflow-hidden">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            JSON Comparator
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400 mt-2">
            Upload or paste two JSON arrays. The tool will analyze object
            structures and help you select key fields for comparison.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto">
          {error && (
            <Alert variant="destructive" className="mb-4 rounded-lg">
              <AlertTitle>Error/Warning</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Key Field Configuration Section: Shown if structures have been analyzed */}
          {(beforeJsonStructures.length > 0 ||
            afterJsonStructures.length > 0) &&
            combinedSignatures.length > 0 && (
              <div className="mb-6 p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <h3 className="text-lg font-semibold mb-3 text-blue-700 dark:text-blue-300">
                  Configure Key Fields for Comparison
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  For each distinct object structure found, select a unique key
                  field. This field must be a non-empty string in all objects of
                  that structure to ensure accurate matching.
                </p>
                <ScrollArea className="max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-2/5">
                          Object Structure (Keys)
                        </TableHead>
                        <TableHead className="w-1/5 text-center">
                          In Before
                        </TableHead>
                        <TableHead className="w-1/5 text-center">
                          In After
                        </TableHead>
                        <TableHead className="w-1/5">
                          Select Key Field
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinedSignatures.map((signature) => {
                        const structBefore = beforeJsonStructures.find(
                          (s) => s.signature === signature
                        );
                        const structAfter = afterJsonStructures.find(
                          (s) => s.signature === signature
                        );

                        let validKeysForSelect: string[] = [];
                        if (structBefore && structAfter) {
                          // Keys valid for selection must be potential keys in *both* structures.
                          validKeysForSelect =
                            structBefore.potentialKeyFields.filter((k) =>
                              structAfter.potentialKeyFields.includes(k)
                            );
                        } else if (structBefore) {
                          // If only in 'Before', use its potential keys (though selection won't be for matching).
                          validKeysForSelect = structBefore.potentialKeyFields;
                        } else if (structAfter) {
                          // If only in 'After', use its potential keys.
                          validKeysForSelect = structAfter.potentialKeyFields;
                        }

                        // This check should ideally not be hit if combinedSignatures is derived correctly.
                        if (!structBefore && !structAfter) return null;

                        return (
                          <TableRow key={signature}>
                            <TableCell className="text-xs break-all">
                              <span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded">
                                {signature.split(",").join(", ")}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {structBefore
                                ? `${structBefore.count} obj`
                                : "N/A"}
                            </TableCell>
                            <TableCell className="text-center">
                              {structAfter ? `${structAfter.count} obj` : "N/A"}
                            </TableCell>
                            <TableCell>
                              {/* Key selection is only mandatory and shown if the structure is in BOTH JSONs */}
                              {structBefore && structAfter ? (
                                validKeysForSelect.length > 0 ? (
                                  <Select
                                    value={selectedKeyConfig[signature] || ""}
                                    onValueChange={(value) =>
                                      handleKeySelectionChange(signature, value)
                                    }
                                  >
                                    <SelectTrigger className="w-full text-xs">
                                      <SelectValue placeholder="Select key..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {validKeysForSelect.map((key) => (
                                        <SelectItem
                                          key={key}
                                          value={key}
                                          className="text-xs"
                                        >
                                          {key}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-red-500">
                                    No common valid string keys found.
                                  </span>
                                )
                              ) : (
                                <span className="text-xs text-gray-500 italic">
                                  Not in both JSONs.
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

          {/* JSON Input Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Before JSON Input Area */}
            <div>
              <Label
                htmlFor="before-json-area"
                className="text-lg font-semibold mb-2 block"
              >
                Before JSON (Array of Objects)
              </Label>
              <Button
                variant="outline"
                className="w-full mb-2 rounded-lg border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 flex items-center justify-center"
                onClick={() => fileInputBeforeRef.current?.click()}
              >
                <UploadCloud className="mr-2 h-5 w-5 flex-shrink-0" />
                <span className="truncate">
                  {fileNameBefore
                    ? `Loaded: ${fileNameBefore}`
                    : "Upload Before JSON File"}
                </span>
              </Button>
              <input
                type="file"
                ref={fileInputBeforeRef}
                accept=".json,application/json"
                onChange={(e) => handleFileChange(e, "before")}
                className="hidden"
              />
              <Textarea
                id="before-json-area"
                placeholder='Paste JSON here or upload a file. e.g., [{"id": "A1", "name": "Alice"}]'
                value={beforeJsonString}
                onChange={(e) => {
                  setBeforeJsonString(e.target.value);
                  if (fileNameBefore) setFileNameBefore("");
                  // Reset key config if JSON is manually changed, as structures might differ.
                  setSelectedKeyConfig({});
                }}
                rows={10}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* After JSON Input Area */}
            <div>
              <Label
                htmlFor="after-json-area"
                className="text-lg font-semibold mb-2 block"
              >
                After JSON (Array of Objects)
              </Label>
              <Button
                variant="outline"
                className="w-full mb-2 rounded-lg border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 flex items-center justify-center"
                onClick={() => fileInputAfterRef.current?.click()}
              >
                <UploadCloud className="mr-2 h-5 w-5 flex-shrink-0" />
                <span className="truncate">
                  {fileNameAfter
                    ? `Loaded: ${fileNameAfter}`
                    : "Upload After JSON File"}
                </span>
              </Button>
              <input
                type="file"
                ref={fileInputAfterRef}
                accept=".json,application/json"
                onChange={(e) => handleFileChange(e, "after")}
                className="hidden"
              />
              <Textarea
                id="after-json-area"
                placeholder='Paste JSON here or upload a file. e.g., [{"id": "A1", "name": "Alice V2"}]'
                value={afterJsonString}
                onChange={(e) => {
                  setAfterJsonString(e.target.value);
                  if (fileNameAfter) setFileNameAfter("");
                  setSelectedKeyConfig({});
                }}
                rows={10}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <Button
            onClick={compareJsons}
            disabled={isCompareDisabled()}
            className="w-full py-3 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition-all duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Compare JSONs
          </Button>

          {/* Comparison Results Display Area */}
          {comparisonResult && (
            <ScrollArea className="mt-8 max-h-[calc(70vh-50px)] w-full rounded-lg border border-gray-200 dark:border-gray-700 p-1 md:p-4 bg-white dark:bg-gray-800 shadow-inner overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4 text-blue-600 dark:text-blue-400 px-3 md:px-0">
                Comparison Results
              </h2>
              {/* Display any warnings from the comparison process */}
              {comparisonResult.errors.length > 0 && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>Comparison Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5">
                      {comparisonResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* New Entries Table */}
              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-2 text-green-600 dark:text-green-400 px-3 md:px-0">
                  New Entries ({comparisonResult.newEntries.length})
                </h3>
                {comparisonResult.newEntries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-100 dark:bg-gray-700">
                        <TableHead className="w-[200px] sticky left-0 bg-inherit z-10">
                          Identifier Value <br />
                          <span className="text-xs italic">
                            (Key:{" "}
                            {selectedKeyConfig[
                              comparisonResult.newEntries[0]?.objectSignature
                            ] || "N/A"}
                            )
                          </span>
                        </TableHead>
                        <TableHead className="w-[200px]">
                          Object Signature
                        </TableHead>
                        <TableHead>Full Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonResult.newEntries.map(
                        (entry, index: number) => {
                          const keyFieldToUse =
                            entry.keyFieldUsed || // If keyFieldUsed is on entry (e.g. part of sig-change)
                            selectedKeyConfig[entry.objectSignature]; // Fallback to general config
                          const idValue = keyFieldToUse
                            ? String(entry[keyFieldToUse])
                            : `(Item ${index + 1})`; // Fallback identifier if no key is applicable
                          return (
                            <TableRow
                              key={`${idValue}-${entry.objectSignature}-${index}`}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
                            >
                              <TableCell className="font-medium sticky left-0 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 z-10 break-all max-w-[150px] sm:max-w-[200px] truncate">
                                {idValue}
                                {keyFieldToUse &&
                                  keyFieldToUse !==
                                    selectedKeyConfig[
                                      entry.objectSignature
                                    ] && (
                                    <span className="block text-xs italic text-gray-500">
                                      Actual Key: {keyFieldToUse}
                                    </span>
                                  )}
                              </TableCell>
                              <TableCell className="font-mono text-xs break-all max-w-[150px] sm:max-w-[200px] truncate">
                                {entry.objectSignature}
                              </TableCell>
                              <TableCell className="font-mono text-sm break-all whitespace-pre-wrap">
                                {JSON.stringify(entry, null, 2)}
                              </TableCell>
                            </TableRow>
                          );
                        }
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 px-3 md:px-0">
                    No new entries found.
                  </p>
                )}
              </div>

              {/* Modified Entries Table */}
              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-2 text-yellow-600 dark:text-yellow-400 px-3 md:px-0">
                  Modified Entries ({comparisonResult.modifiedEntries.length})
                </h3>
                {comparisonResult.modifiedEntries.length > 0 ? (
                  <Table style={{ tableLayout: "fixed" }}>
                    <TableHeader>
                      <TableRow className="bg-gray-100 dark:bg-gray-700">
                        <TableHead className="w-[150px] sm:w-[200px] sticky left-0 bg-inherit z-10">
                          Identifier Value <br />
                          <span className="text-xs italic">
                            (Key: per entry)
                          </span>
                        </TableHead>
                        <TableHead className="w-[25%] sm:w-[30%]">
                          Before
                        </TableHead>
                        <TableHead className="w-[25%] sm:w-[30%]">
                          After
                        </TableHead>
                        <TableHead className="min-w-[200px] sm:min-w-[250px]">
                          Changes
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonResult.modifiedEntries.map(
                        (entry: ModifiedEntry, index: number) => (
                          <TableRow
                            key={`${entry.keyFieldValue}-${entry.objectSignature}-${index}`}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group cursor-pointer"
                            onClick={() => setSelectedModifiedEntry(entry)}
                          >
                            <TableCell className="font-medium sticky left-0 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 z-10 break-all max-w-[150px] sm:max-w-[200px] truncate">
                              {entry.keyFieldValue}
                              <span className="block text-xs italic text-gray-500">
                                Key: {entry.keyFieldUsed}
                              </span>
                              <span
                                className="block text-xs italic text-gray-500 mt-1"
                                title={entry.objectSignature}
                              >
                                Sig: {entry.objectSignature.substring(0, 20)}...
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-sm break-all whitespace-pre-wrap">
                              <ScrollArea className="max-h-32">
                                {JSON.stringify(entry.before, null, 2)}
                              </ScrollArea>
                            </TableCell>
                            <TableCell className="font-mono text-sm break-all whitespace-pre-wrap">
                              <ScrollArea className="max-h-32">
                                {JSON.stringify(entry.after, null, 2)}
                              </ScrollArea>
                            </TableCell>
                            <TableCell className="font-mono text-xs break-all whitespace-pre-wrap">
                              <ScrollArea className="max-h-32 overflow-y-auto">
                                {Object.keys(entry.changes.added).length >
                                  0 && (
                                  <div className="mb-1">
                                    <strong className="text-green-600 dark:text-green-400">
                                      Added:
                                    </strong>
                                    <pre className="mt-0.5 p-1 bg-green-50 dark:bg-green-900/30 rounded text-xs">
                                      {JSON.stringify(
                                        entry.changes.added,
                                        null,
                                        2
                                      )}
                                    </pre>
                                  </div>
                                )}
                                {Object.keys(entry.changes.removed).length >
                                  0 && (
                                  <div className="mb-1">
                                    <strong className="text-red-600 dark:text-red-400">
                                      Removed:
                                    </strong>
                                    <pre className="mt-0.5 p-1 bg-red-50 dark:bg-red-900/30 rounded text-xs">
                                      {JSON.stringify(
                                        entry.changes.removed,
                                        null,
                                        2
                                      )}
                                    </pre>
                                  </div>
                                )}
                                {Object.keys(entry.changes.changed).length >
                                  0 && (
                                  <div>
                                    <strong className="text-yellow-600 dark:text-yellow-400">
                                      Changed:
                                    </strong>
                                    {Object.entries(entry.changes.changed).map(
                                      ([k, val]: [
                                        string,
                                        { before: unknown; after: unknown }
                                      ]) => (
                                        <div
                                          key={k}
                                          className="ml-2 my-1 p-1 bg-yellow-50 dark:bg-yellow-900/30 rounded"
                                        >
                                          <p className="font-semibold">{k}:</p>
                                          <p>
                                            <span className="text-red-500 line-through">
                                              {JSON.stringify(val.before)}
                                            </span>{" "}
                                            <span className="text-gray-400 dark:text-gray-500">
                                              {" "}
                                              -&gt;{" "}
                                            </span>{" "}
                                            <span className="text-green-500">
                                              {JSON.stringify(val.after)}
                                            </span>
                                          </p>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                              </ScrollArea>
                            </TableCell>
                          </TableRow>
                        )
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 px-3 md:px-0">
                    No modified entries found.
                  </p>
                )}
              </div>

              {/* Deleted Entries Table */}
              <div>
                <h3 className="text-xl font-semibold mb-2 text-red-600 dark:text-red-400 px-3 md:px-0">
                  Deleted Entries ({comparisonResult.deletedEntries.length})
                </h3>
                {comparisonResult.deletedEntries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-100 dark:bg-gray-700">
                        <TableHead className="w-[200px] sticky left-0 bg-inherit z-10">
                          Identifier Value <br />
                          <span className="text-xs italic">
                            (Key:{" "}
                            {selectedKeyConfig[
                              comparisonResult.deletedEntries[0]
                                ?.objectSignature
                            ] || "N/A"}
                            )
                          </span>
                        </TableHead>
                        <TableHead className="w-[200px]">
                          Object Signature
                        </TableHead>
                        <TableHead>Full Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonResult.deletedEntries.map(
                        (entry, index: number) => {
                          const keyFieldToUse =
                            entry.keyFieldUsed ||
                            selectedKeyConfig[entry.objectSignature];
                          const idValue = keyFieldToUse
                            ? String(entry[keyFieldToUse])
                            : `(Item ${index + 1})`;
                          return (
                            <TableRow
                              key={`${idValue}-${entry.objectSignature}-${index}`}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
                            >
                              <TableCell className="font-medium sticky left-0 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 z-10 break-all max-w-[150px] sm:max-w-[200px] truncate">
                                {idValue}
                                {keyFieldToUse &&
                                  keyFieldToUse !==
                                    selectedKeyConfig[
                                      entry.objectSignature
                                    ] && (
                                    <span className="block text-xs italic text-gray-500">
                                      Actual Key: {keyFieldToUse}
                                    </span>
                                  )}
                              </TableCell>
                              <TableCell className="font-mono text-xs break-all max-w-[150px] sm:max-w-[200px] truncate">
                                {entry.objectSignature}
                              </TableCell>
                              <TableCell className="font-mono text-sm break-all whitespace-pre-wrap">
                                {JSON.stringify(entry, null, 2)}
                              </TableCell>
                            </TableRow>
                          );
                        }
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 px-3 md:px-0">
                    No deleted entries found.
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
        {/* Footer Section */}
        <CardFooter className="py-4 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400 flex flex-col sm:flex-row justify-between items-center">
          <div>
            Designed by{" "}
            <a
              href="https://jlwilley.com" // User should replace this with their actual link
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-500"
            >
              jlwilley <ExternalLink className="inline h-3 w-3 ml-0.5" />
            </a>
          </div>
          <a
            href="https://github.com/jlwilley/JsonCompare" // User should replace with their actual GitHub repo
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-500 flex items-center mt-2 sm:mt-0"
          >
            <Github className="h-4 w-4 mr-1" /> View on GitHub
            <ExternalLink className="inline h-3 w-3 ml-0.5" />
          </a>
        </CardFooter>
      </Card>

      {/* Modal for Detailed Differences of a Modified Entry */}
      {selectedModifiedEntry && (
        <Dialog
          open={!!selectedModifiedEntry}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedModifiedEntry(null);
          }}
        >
          <DialogContent className="max-w-3xl w-[90vw] max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                Detailed Differences for:{" "}
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  {selectedModifiedEntry.keyFieldValue}
                </span>
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                  (Key: {selectedModifiedEntry.keyFieldUsed}, Structure:{" "}
                  {selectedModifiedEntry.objectSignature.split(",").join(", ")})
                </span>
              </DialogTitle>
              <DialogDescription>
                Showing changes between the &apos;Before&apos; and
                &apos;After&apos; versions of this entry.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-grow pr-6 -mr-6">
              {" "}
              {/* pr-6 and -mr-6 for scrollbar space */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    Before
                  </h3>
                  <pre className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md text-sm whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                    {JSON.stringify(selectedModifiedEntry.before, null, 2)}
                  </pre>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    After
                  </h3>
                  <pre className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md text-sm whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                    {JSON.stringify(selectedModifiedEntry.after, null, 2)}
                  </pre>
                </div>
              </div>
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">
                  Specific Changes:
                </h3>
                {Object.keys(selectedModifiedEntry.changes.added).length ===
                  0 &&
                  Object.keys(selectedModifiedEntry.changes.removed).length ===
                    0 &&
                  Object.keys(selectedModifiedEntry.changes.changed).length ===
                    0 && (
                    <p className="text-sm text-gray-500">
                      No specific field changes detected. This might indicate
                      only whitespace or ordering differences if objects are not
                      deeply equal but no specific fields were
                      added/removed/modified.
                    </p>
                  )}

                {Object.entries(selectedModifiedEntry.changes.added).map(
                  ([key, value]) => (
                    <DiffDetail
                      key={`added-${key}`}
                      title="Added Field"
                      itemKey={key}
                      data={{ [key]: value }}
                      changeType="added"
                    />
                  )
                )}
                {Object.entries(selectedModifiedEntry.changes.removed).map(
                  ([key, value]) => (
                    <DiffDetail
                      key={`removed-${key}`}
                      title="Removed Field"
                      itemKey={key}
                      data={{ [key]: value }}
                      changeType="removed"
                    />
                  )
                )}
                {Object.entries(selectedModifiedEntry.changes.changed).map(
                  ([key, values]) => (
                    <div key={`changed-${key}`} className="mb-3">
                      <h4 className="font-semibold text-sm mb-1">
                        Changed Field: <span className="font-mono">{key}</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <DiffDetail
                          title="Value Before"
                          // Ensure data passed to DiffDetail is an object for consistent stringification,
                          // especially if 'values.before' itself is a primitive.
                          data={
                            typeof values.before === "object" &&
                            values.before !== null
                              ? (values.before as Record<string, unknown>)
                              : { value: values.before } // Wrap primitive in an object
                          }
                          changeType="changed-before"
                        />
                        <DiffDetail
                          title="Value After"
                          data={
                            typeof values.after === "object" &&
                            values.after !== null
                              ? (values.after as Record<string, unknown>)
                              : { value: values.after } // Wrap primitive
                          }
                          changeType="changed-after"
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </ScrollArea>
            <DialogFooter className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
