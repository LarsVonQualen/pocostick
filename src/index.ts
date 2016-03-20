import * as pluralize from "pluralize";
import * as fs from "fs";
import * as path from "path";
import {IConfig} from "./IConfig";
import MysqlHandler from "./MysqlHandler";
import MssqlHandler from "./MssqlHandler";
import {IDatabaseHandler} from "./IDatabaseHandler";
import {IRow} from "./IRow";
import PocoFile from "./PocoFile";
let pascalcase = require("pascalcase");

export default class PocoStick {
    private now = new Date();
    private templateClass = fs.readFileSync(path.join(path.dirname(__filename), "poco.ts"), "utf8");
    private templateProperty = [
        "\t\t/**",
        "\t\t * Generated by Pocostick",
        "\t\t *",
        "\t\t * @name {{className}}#{{name}}",
        "\t\t * @type {{type}}{{nullable}}",
        "\t\t * @default {{defaultValue}}",
        "\t\t */",
        "\t\t{{name}}: {{type}};"
    ];

    private tsTypes = {
        number: "number",
        string: "string",
        boolean: "boolean",
        date: "Date"
    };

    private mysqlTypes = {
        // Numbers
        "int": this.tsTypes.number,
        "tinyint": this.tsTypes.number,
        "smallint": this.tsTypes.number,
        "mediumint": this.tsTypes.number,
        "bigint": this.tsTypes.number,
        "float": this.tsTypes.number,
        "double": this.tsTypes.number,
        "decimal": this.tsTypes.number,

        // Dates
        "date": this.tsTypes.date,
        "datetime": this.tsTypes.date,
        "timestamp": this.tsTypes.date,
        "time": this.tsTypes.date,
        "year": this.tsTypes.date,

        // Strings
        "char": this.tsTypes.string,
        "varchar": this.tsTypes.string,
        "nvarchar": this.tsTypes.string,
        "text": this.tsTypes.string,
        "tinytext": this.tsTypes.string,
        "mediumtext": this.tsTypes.string,
        "longtext": this.tsTypes.string,

        // Booleans
        "bit": this.tsTypes.boolean
    };
    private mssqlTypes = {
        // Numbers
        "int": this.tsTypes.number,
        "tinyint": this.tsTypes.number,
        "smallint": this.tsTypes.number,
        "mediumint": this.tsTypes.number,
        "bigint": this.tsTypes.number,
        "float": this.tsTypes.number,
        "double": this.tsTypes.number,
        "decimal": this.tsTypes.number,

        // Dates
        "date": this.tsTypes.date,
        "datetime": this.tsTypes.date,
        "timestamp": this.tsTypes.date,
        "time": this.tsTypes.date,
        "year": this.tsTypes.date,

        // Strings
        "char": this.tsTypes.string,
        "varchar": this.tsTypes.string,
        "nvarchar": this.tsTypes.string,
        "text": this.tsTypes.string,
        "tinytext": this.tsTypes.string,
        "mediumtext": this.tsTypes.string,
        "longtext": this.tsTypes.string,

        // Booleans
        "bit": this.tsTypes.boolean
    };

    private typeMap = {};
    
    private db: IDatabaseHandler;

    constructor(public config: IConfig, public defaultNamespace = "PocoStick.Models", public logger: (message: string) => void = message => console.log(message)) {
        switch (config.driver) {
            case "mysql":
                this.useMysql();
                break;
            case "mssql":
                this.useMssql();
                break;
            default:
                throw new Error("Unsupported driver");
        }
    }

    public generate(completed: () => void, dryRun: boolean = false) {
        this.db.connect();

        try {
            this.db.query((err, rows: Array<IRow>) => {
                if (err !== null) {
                    throw new Error(err.message);
                }

                var tableNames = rows
                    .map(row => row.tableName)
                    .filter((val, pos, arr) => arr.indexOf(val) === pos);

                var files: Array<PocoFile> = tableNames.map(tableName => this.createFile(rows, tableName));

                if (!dryRun) {
                    files.forEach(file => {
                        try {
                            fs.writeFileSync(file.filename, file.content, "utf8");
                        } catch (e) {
                            console.error(e);
                        }
                    });
                }

                this.db.end();

                this.logger("Finished");

                completed();
            });
        } catch (e) {
            console.error(e);
        }
    }

    private useMssql() {
        this.typeMap = this.mssqlTypes;

        this.db = new MssqlHandler(this.config);
    }

    private useMysql() {
        this.typeMap = this.mysqlTypes;

        this.db = new MysqlHandler(this.config);
    }

    private static getProperName(tableName: string) {
        return pluralize.singular(pascalcase(tableName));
    }

    private createFile(rows: Array<IRow>, tableName: string) {
        var fileName = `${PocoStick.getProperName(tableName)}.ts`;

        this.logger(`Creating file '${fileName}'`);

        return new PocoFile(`${this.config.output}${fileName}`, this.createClass(rows, tableName));
    }

    private createClass(rows: Array<IRow>, tableName: string) {
        var className = PocoStick.getProperName(tableName);

        this.logger(`\tCreating class '${className}'`);

        return this.templateClass
            .replace("POCOSTICK_DEFAULT_NAMESPACE", this.defaultNamespace)
            .replace("POCOSTICK_CLASS_NAME", className)
            .replace("{{now}}", this.now.toString())
            .replace("// POCOSTICK_PROPERTIES", this.createProperties(rows, tableName));
    }

    private createProperties(rows: Array<IRow>, tableName: string) {
        var className = PocoStick.getProperName(tableName);

        this.logger(`\t\tCreating properties for class '${className}'`);

        return rows
            .filter(row => row.tableName === tableName)
            .map(field => this.createProperty(field, className))
            .join("\r\n");
    }

    private createProperty(row: IRow, className: string) {
        var name = PocoStick.getProperName(row.name);
        var type = this.typeMap[row.type];
        var isNullable = row.isNullable;

        this.logger(`\t\tCreating property '${name}' of type '${type}' that ${isNullable ? "IS" : "is not"} nullable.`);

        return this.templateProperty.map(line => {
            if (line.match("{{defaultValue}}") && row.defaultValue === null) {
                return null;
            }

            return line
                .replace("{{name}}", name)
                .replace("{{type}}", type)
                .replace("{{className}}", className)
                .replace("{{nullable}}", isNullable ? "?" : "")
                .replace("{{defaultValue}}", row.defaultValue !== null ? row.defaultValue : "");
        }).filter(line => line !== null).join("\r\n");
    }
}