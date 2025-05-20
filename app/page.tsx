"use client";
import React, { useState, useCallback, useRef } from "react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { UploadCloud } from "lucide-react";

// Define interfaces for better type safety
interface JsonEntry {
  [key: string]: unknown;
}

interface FieldChanges {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { before: unknown; after: unknown }>;
}

interface ModifiedEntry {
  keyFieldValue: string;
  before: JsonEntry;
  after: JsonEntry;
  changes: FieldChanges;
}

interface ComparisonResult {
  newEntries: JsonEntry[];
  modifiedEntries: ModifiedEntry[];
  deletedEntries: JsonEntry[];
}

// Component to render individual differences in the modal
const DiffDetail: React.FC<{
  title: string;
  data: Record<string, unknown> | null;
  itemKey?: string;
  changeType: "added" | "removed" | "changed-before" | "changed-after";
}> = ({ title, data, itemKey, changeType }) => {
  if (!data || Object.keys(data).length === 0) {
    if (changeType === "added" || changeType === "removed") return null; // Don't render if no added/removed data
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

// Main application component for the JSON Comparator
export default function App() {
  const [beforeJsonString, setBeforeJsonString] = useState<string>("");
  const [afterJsonString, setAfterJsonString] = useState<string>("");
  const [keyField, setKeyField] = useState<string>("name");
  const [comparisonResult, setComparisonResult] =
    useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string>("");
  const [fileNameBefore, setFileNameBefore] = useState<string>("");
  const [fileNameAfter, setFileNameAfter] = useState<string>("");

  // State to manage the display of detailed differences in a modal
  const [selectedModifiedEntry, setSelectedModifiedEntry] =
    useState<ModifiedEntry | null>(null);

  const fileInputBeforeRef = useRef<HTMLInputElement>(null);
  const fileInputAfterRef = useRef<HTMLInputElement>(null);

  const parseJson = (
    // Parses a JSON string into an array of objects, validating the presence and type of a key field.
    //
    // Parameters:
    //   jsonString: The JSON string to parse.
    //   currentKeyField: The name of the key field that must be present in each object.
    //
    // Returns: An array of JsonEntry objects if parsing is successful, otherwise null.
    jsonString: string,
    currentKeyField: string
  ): JsonEntry[] | null => {
    if (!currentKeyField.trim()) {
      setError("Key field cannot be empty.");
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) {
        throw new Error("Input JSON must be an array of objects.");
      }
      if (
        !parsed.every(
          (item) =>
            typeof item === "object" &&
            item !== null && // Ensure item is not null
            Object.prototype.hasOwnProperty.call(item, currentKeyField) && // Check if the key field exists
            typeof item[currentKeyField] === "string" && // Check if the key field is a string
            item[currentKeyField].trim() !== "" // Check if the key field is non-empty after trimming whitespace
        )
      ) {
        throw new Error(
          `Each item in the JSON array must be an object with a non-empty string field named "${currentKeyField}".`
        );
      }
      return parsed as JsonEntry[];
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(`JSON Parsing Error: ${e.message}`);
      } else {
        setError("An unknown JSON parsing error occurred.");
      }
      return null;
    }
  };

  const calculateFieldChanges = (
    // Calculates the differences between two objects, identifying added, removed, and changed fields.
    //
    // Parameters:
    //   obj1: The "before" object.
    //   obj2: The "after" object.
    //
    // Returns: An object containing the added, removed, and changed fields, along with their values.
    //          For changed fields, it includes both the "before" and "after" values.
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

      if (
        !Object.prototype.hasOwnProperty.call(obj1, key) &&
        Object.prototype.hasOwnProperty.call(obj2, key)
      ) {
        // Field is present in obj2 but not in obj1, indicating it was added.
        changes.added[key] = val2;
      } else if (
        Object.prototype.hasOwnProperty.call(obj1, key) &&
        !Object.prototype.hasOwnProperty.call(obj2, key)
      ) {
        // Field is present in obj1 but not in obj2, indicating it was removed.
        changes.removed[key] = val1;
      } else if (!isEqual(val1, val2)) {
        // Field is present in both objects but has different values, indicating it was changed.
        changes.changed[key] = { before: val1, after: val2 };
      } else {
        // Field is present in both objects and has the same value, so no change.
        // This case is handled implicitly by not adding anything to the changes object for this key.
        // No action needed here, as we only care about differences.
        // This comment is just for clarity.
      }
    });
    return changes;
  };

  const compareJsons = useCallback(() => {
    setError("");
    // Compares two JSON strings, identifying new, modified, and deleted entries based on a key field.
    //
    // This function parses the JSON strings, validates the key field, and then compares the entries
    // to determine the differences.  It uses the `calculateFieldChanges` function to identify
    // specific field-level changes within modified entries.
    //
    // The results are stored in the `comparisonResult` state variable.
    // Errors during parsing or validation are stored in the `error` state variable.
    setComparisonResult(null);

    if (!keyField.trim()) {
      setError("Please specify a Key Field for comparison.");
      return;
    }

    const beforeData = parseJson(beforeJsonString, keyField);
    const afterData = parseJson(afterJsonString, keyField);

    if (!beforeData || !afterData) {
      return;
    }

    // Create maps for efficient lookup of entries by their key field value.
    const beforeMap = new Map<string, JsonEntry>();
    beforeData.forEach((item: JsonEntry) => {
      beforeMap.set(item[keyField] as string, item);
    });

    const afterMap = new Map<string, JsonEntry>();

    afterData.forEach((item: JsonEntry) => {
      afterMap.set(item[keyField] as string, item);
    });

    const newEntries: JsonEntry[] = [];
    const modifiedEntries: ModifiedEntry[] = [];
    const deletedEntries: JsonEntry[] = [];

    // Iterate through the "after" data to find new and modified entries.
    afterMap.forEach((afterItem: JsonEntry, keyValue: string) => {
      if (!beforeMap.has(keyValue)) {
        // Entry is present in "after" but not in "before", indicating a new entry.
        newEntries.push(afterItem);
      } else {
        // Entry is present in both "before" and "after", check for modifications.
        const beforeItem: JsonEntry = beforeMap.get(keyValue)!;
        if (!isEqual(beforeItem, afterItem)) {
          // Entries are not deeply equal, calculate field-level changes.
          const changes = calculateFieldChanges(beforeItem, afterItem);
          if (
            changes.changed[keyField] &&
            isEqual(beforeItem[keyField], afterItem[keyField])
          ) {
            // If the key field itself is listed as changed but its value is actually the same, remove it from the changes.
            // This can happen due to type coercion or other subtle differences that `isEqual` might catch but we don't care about for the key field.
            delete changes.changed[keyField];
          }
          if (
            // If there are any changes (added, removed, or changed fields), consider the entry as modified.
            // An entry is considered modified if there are any field-level changes.
            Object.keys(changes.added).length > 0 ||
            Object.keys(changes.removed).length > 0 ||
            Object.keys(changes.changed).length > 0
          ) {
            modifiedEntries.push({
              keyFieldValue: keyValue,
              before: beforeItem,
              after: afterItem,
              changes,
            });
          }
        }
      }
    });
    // Iterate through the "before" data to find deleted entries.
    beforeMap.forEach((beforeItem: JsonEntry, keyValue: string) => {
      if (!afterMap.has(keyValue)) {
        // Entry is present in "before" but not in "after", indicating a deleted entry.
        deletedEntries.push(beforeItem);
      }
    });
    // Update the state with the comparison results.

    setComparisonResult({ newEntries, modifiedEntries, deletedEntries });
  }, [beforeJsonString, afterJsonString, keyField]);

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "before" | "after"
    // Handles file input changes, reading the content of a JSON file and updating the corresponding state.
    //
    // Parameters:
    //   event: The change event from the file input element.
    //   type:  Indicates whether the file is for the "before" or "after" JSON data.
    //
    // This function validates the file type, reads the file content, and updates the appropriate state variables.
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== "application/json") {
        setError(
          `Error: ${
            type === "before" ? "Before" : "After"
          } file must be a JSON file.`
        );
        // Clear the file input value to allow re-selection of a valid file.
        if (type === "before" && fileInputBeforeRef.current)
          fileInputBeforeRef.current.value = "";
        if (type === "after" && fileInputAfterRef.current)
          fileInputAfterRef.current.value = "";
        // Clear the file name display.
        if (type === "before") setFileNameBefore("");
        else setFileNameAfter("");
        return;
      }
      setError("");

      const reader = new FileReader();
      reader.onload = (e) => {
        // Callback function executed when the file is successfully read.
        try {
          const content = e.target?.result as string;
          if (type === "before") {
            setBeforeJsonString(content);
            setFileNameBefore(file.name);
          } else {
            setAfterJsonString(content);
            setFileNameAfter(file.name);
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // Handle errors during file reading.
          setError(`Error reading file ${file.name}.`);
          if (type === "before") setFileNameBefore("");
          else setFileNameAfter("");
        }
      };
      reader.onerror = () => {
        // Callback function executed if an error occurs while reading the file.
        setError(`Error reading file ${file.name}.`);
        if (type === "before") setFileNameBefore("");
        else setFileNameAfter("");
      };
      // Start reading the file as text.
      reader.readAsText(file);
    } else {
      // If no file is selected, clear the file name display.
      if (type === "before") setFileNameBefore("");
      else setFileNameAfter("");
    }
    if (event.target) {
      event.target.value = "";
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 min-h-screen flex flex-col items-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50 font-inter">
      <Card className="w-full max-w-5xl shadow-lg rounded-xl flex flex-col overflow-hidden">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            JSON Comparator
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400 mt-2">
            Upload or paste two JSON arrays. Specify a key field to identify and
            compare entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto">
          {/* Allow CardContent to scroll if needed, though ScrollArea below is primary */}
          {error && (
            <Alert variant="destructive" className="mb-4 rounded-lg">
              <AlertTitle>Error!</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="mb-6">
            <Label
              htmlFor="key-field"
              className="text-lg font-semibold mb-2 block"
            >
              Key Field for Comparison
            </Label>
            <Input
              id="key-field"
              placeholder="e.g., name, id, sku"
              value={keyField}
              onChange={(e) => setKeyField(e.target.value)}
              className="w-full md:w-1/2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              The field name used to uniquely identify entries. This field must
              exist in all objects and its value must be a string.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
                  {/* Added truncate for filename */}
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
                placeholder='Paste JSON here or upload a file. e.g., [{"name": "Alice", "age": 30}]'
                value={beforeJsonString}
                onChange={(e) => {
                  setBeforeJsonString(e.target.value);
                  if (fileNameBefore) setFileNameBefore("");
                }}
                rows={10}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

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
                  {/* Added truncate for filename */}
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
                placeholder='Paste JSON here or upload a file. e.g., [{"name": "Bob", "age": 25}]'
                value={afterJsonString}
                onChange={(e) => {
                  setAfterJsonString(e.target.value);
                  if (fileNameAfter) setFileNameAfter("");
                }}
                rows={10}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <Button
            onClick={compareJsons}
            disabled={
              !beforeJsonString.trim() ||
              !afterJsonString.trim() ||
              !keyField.trim()
            }
            className="w-full py-3 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition-all duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Compare JSONs
          </Button>
          {comparisonResult && (
            // Ensure ScrollArea is constrained by its parent's height
            <ScrollArea className="mt-8 max-h-[calc(70vh-50px)] w-full rounded-lg border border-gray-200 dark:border-gray-700 p-1 md:p-4 bg-white dark:bg-gray-800 shadow-inner overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4 text-blue-600 dark:text-blue-400 px-3 md:px-0">
                Comparison Results
              </h2>

              {/* New Entries */}
              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-2 text-green-600 dark:text-green-400 px-3 md:px-0">
                  New Entries ({comparisonResult.newEntries.length})
                </h3>
                {comparisonResult.newEntries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-100 dark:bg-gray-700">
                        <TableHead className="w-[200px] sticky left-0 bg-inherit z-10">
                          Key: {keyField}
                        </TableHead>
                        <TableHead>Full Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonResult.newEntries.map(
                        (entry: JsonEntry, index: number) => (
                          <TableRow
                            key={`${entry[keyField]}-${index}`}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
                          >
                            <TableCell className="font-medium sticky left-0 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 z-10 break-all max-w-[150px] sm:max-w-[200px] truncate">
                              {" "}
                              {/* Added max-w and truncate */}
                              {
                                String(entry[keyField]) // Ensure key field value is treated as a string
                              }
                            </TableCell>
                            <TableCell className="font-mono text-sm break-all whitespace-pre-wrap">
                              {JSON.stringify(entry, null, 2)}
                            </TableCell>
                          </TableRow>
                        )
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 px-3 md:px-0">
                    No new entries found.
                  </p>
                )}
              </div>

              {/* Modified Entries */}
              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-2 text-yellow-600 dark:text-yellow-400 px-3 md:px-0">
                  Modified Entries ({comparisonResult.modifiedEntries.length})
                </h3>
                {comparisonResult.modifiedEntries.length > 0 ? (
                  <Table style={{ tableLayout: "fixed" }}>
                    <TableHeader>
                      <TableRow className="bg-gray-100 dark:bg-gray-700">
                        <TableHead className="w-[150px] sm:w-[200px] sticky left-0 bg-inherit z-10">
                          Key: {keyField}
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
                            key={`${entry.keyFieldValue}-${index}`}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group cursor-pointer"
                            onClick={() => setSelectedModifiedEntry(entry)}
                          >
                            <TableCell className="font-medium sticky left-0 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 z-10 break-all max-w-[150px] sm:max-w-[200px] truncate">
                              {" "}
                              {/* Added max-w and truncate */}
                              {entry.keyFieldValue}
                            </TableCell>
                            <TableCell className="font-mono text-sm break-all whitespace-pre-wrap">
                              <ScrollArea className="max-h-32">
                                {" "}
                                {/* Scroll within cell for "Before" data */}
                                {JSON.stringify(entry.before, null, 2)}
                              </ScrollArea>
                            </TableCell>
                            <TableCell className="font-mono text-sm break-all whitespace-pre-wrap">
                              <ScrollArea className="max-h-32">
                                {" "}
                                {/* Scroll within cell for "After" data */}
                                {JSON.stringify(entry.after, null, 2)}
                              </ScrollArea>
                            </TableCell>
                            <TableCell className="font-mono text-xs break-all whitespace-pre-wrap">
                              <ScrollArea className="max-h-32 overflow-y-auto">
                                {" "}
                                {/* Scroll within cell */}
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

              {/* Deleted Entries */}
              <div>
                <h3 className="text-xl font-semibold mb-2 text-red-600 dark:text-red-400 px-3 md:px-0">
                  Deleted Entries ({comparisonResult.deletedEntries.length})
                </h3>
                {comparisonResult.deletedEntries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-100 dark:bg-gray-700">
                        <TableHead className="w-[200px] sticky left-0 bg-inherit z-10">
                          Key: {keyField}
                        </TableHead>
                        <TableHead>Full Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonResult.deletedEntries.map(
                        (entry: JsonEntry, index: number) => (
                          <TableRow
                            key={`${entry[keyField]}-${index}`}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
                          >
                            <TableCell className="font-medium sticky left-0 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 z-10 break-all max-w-[150px] sm:max-w-[200px] truncate">
                              {" "}
                              {/* Added max-w and truncate */}
                              {
                                String(entry[keyField]) // Ensure key field value is treated as a string
                              }
                            </TableCell>
                            <TableCell className="font-mono text-sm break-all whitespace-pre-wrap">
                              {JSON.stringify(entry, null, 2)}
                            </TableCell>
                          </TableRow>
                        )
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
      </Card>

      {/* Detailed Difference View Modal */}
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
              </DialogTitle>
              <DialogDescription>
                Showing changes between the &apos;Before&apos; and
                &apos;After&apos; versions of this entry.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-grow pr-6 -mr-6">
              {/* pr-6 and -mr-6 to give space for scrollbar without shrinking content */}
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
                      No specific field changes detected (this might indicate
                      only whitespace or ordering differences if objects are not
                      deeply equal but no fields were added/removed/modified).
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
                          title="Before"
                          data={values.before as Record<string, unknown>}
                          changeType="changed-before"
                        />
                        <DiffDetail
                          title="After"
                          data={values.after as Record<string, unknown>}
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
