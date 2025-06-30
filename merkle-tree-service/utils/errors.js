class MerkleTreeError extends Error {
    constructor(message, code = 'MERKLE_ERROR') {
        super(message);
        this.name = 'MerkleTreeError';
        this.code = code;
    }
}

class DatabaseError extends Error {
    constructor(message, code = 'DB_ERROR') {
        super(message);
        this.name = 'DatabaseError';
        this.code = code;
    }
}

class FileSystemError extends Error {
    constructor(message, code = 'FS_ERROR') {
        super(message);
        this.name = 'FileSystemError';
        this.code = code;
    }
}

class SchedulerError extends Error {
    constructor(message, code = 'SCHEDULER_ERROR') {
        super(message);
        this.name = 'SchedulerError';
        this.code = code;
    }
}

module.exports = {
    MerkleTreeError,
    DatabaseError,
    FileSystemError,
    SchedulerError
};