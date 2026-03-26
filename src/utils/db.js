const {
    loadSettings
} = require('../../settings')
let settings = loadSettings();

const {
    logWithTimestamp,
    handleError
} = require('./index')

const mysql = require('mysql2/promise');

const moment = require('moment');

const pool = mysql.createPool({
    host: settings.database.host,
    user: settings.database.user,
    password: settings.database.password,
    database: settings.database.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


async function tableExists(tableName) {
    const [rows] = await pool.query("SHOW TABLES LIKE ?", [tableName]);
    return rows.length > 0;
}

async function createTable(tableName, tableType = 'volume_24h') {
    let query;
    try {
        if (tableType === 'volume_24h') {
            query = `
                CREATE TABLE ${tableName} (
                    timestamp DATETIME PRIMARY KEY,
                    volume_24h DECIMAL(30,2) NOT NULL
                )
            `;
        } else if (tableType === 'open_interest') {
            query = `
                CREATE TABLE ${tableName} (
                    timestamp DATETIME PRIMARY KEY,
                    open_interest DECIMAL(30,2) NOT NULL
                )
            `;
        } else {
            throw new Error(`Unrecognized table type: ${tableType}. Only 'volume_24h' and 'open_interest' are supported.`);
        }

        await pool.query(query);
    } catch (error) {
        const errorMessage = `Error creating table ${tableName}: ${error.message}`;
        handleError(errorMessage, true);
        throw error;
    }
}

async function insertVolumeData(tableName, volumeData) {

    logWithTimestamp(`Table name: ${tableName}`)
    console.log('Inserting volume data:', volumeData);

    try {
        logWithTimestamp(`${tableName}: Inserting ${volumeData.length} rows.`)

        const query = `
            INSERT INTO ${tableName} (timestamp, volume_24h) VALUES ?
            ON DUPLICATE KEY UPDATE
                volume_24h = VALUES(volume_24h)
        `;

        const values = volumeData.map(data => [
            data.timestamp,
            data.volume24h,
        ]);

        if (values.length > 0) {
            console.log('Inserting values:', values);
        }

        await pool.query(query, [values]);

    } catch (error) {
        const errorMessage = `Error inserting data into table ${tableName}: ${error.message}`;
        handleError(errorMessage, true);
        throw error;
    }
}

async function insertOpenInterestData(tableName, oiData) {

    logWithTimestamp(`Table name: ${tableName}`)
    console.log('Inserting open interest data:', oiData);

    try {
        logWithTimestamp(`${tableName}: Inserting ${oiData.length} rows.`)

        const query = `
            INSERT INTO ${tableName} (timestamp, open_interest) VALUES ?
            ON DUPLICATE KEY UPDATE
                open_interest = VALUES(open_interest)
        `;

        const values = oiData.map(data => [
            data.timestamp,
            data.openInterest,
        ]);

        if (values.length > 0) {
            console.log('Inserting values:', values);
        }

        await pool.query(query, [values]);

    } catch (error) {
        const errorMessage = `Error inserting data into table ${tableName}: ${error.message}`;
        handleError(errorMessage, true);
        throw error;
    }
}

async function deleteOldData(daysToKeep, callback) {
    try {
        // Calculate the cutoff date
        const cutoffDate = moment().utc().subtract(daysToKeep, 'days').startOf('minute').format('YYYY-MM-DD HH:mm:ss');

        // Fetch all table names matching volume_24h pattern
        const [volumeTables] = await pool.query(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE '%_volume_24h_%'`,
            [settings.database.database]
        );

        // Fetch all table names matching open_interest pattern
        const [oiTables] = await pool.query(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE '%_open_interest_%'`,
            [settings.database.database]
        );

        const tables = [...volumeTables, ...oiTables];

        for (const table of tables) {
            const tableName = table.TABLE_NAME;

            // Count current rows before deletion
            const countBeforeQuery = `SELECT COUNT(*) AS count FROM ${mysql.escapeId(tableName)}`;
            const [rowCountBefore] = await pool.query(countBeforeQuery);

            // Delete operation
            const deleteQuery = `
                DELETE FROM ${mysql.escapeId(tableName)}
                WHERE timestamp < ?
            `;
            await pool.query(deleteQuery, [cutoffDate]);

            // Count remaining rows after deletion
            const countAfterQuery = `SELECT COUNT(*) AS count FROM ${mysql.escapeId(tableName)}`;
            const [rowCountAfter] = await pool.query(countAfterQuery);

            // Calculate number of rows deleted
            const rowsDeleted = rowCountBefore[0].count - rowCountAfter[0].count;

            logWithTimestamp(`Deleted ${rowsDeleted} rows from table ${tableName}. Current rows in table: ${rowCountAfter[0].count}`);
        }

    } catch (error) {
        console.error('Error in deleteOldData:', error);
        handleError(`Error deleting old data: ${error.message}`, true);
    }

    if (callback) callback();
}

module.exports = {
    tableExists,
    createTable,
    insertVolumeData,
    insertOpenInterestData,
    deleteOldData
};
