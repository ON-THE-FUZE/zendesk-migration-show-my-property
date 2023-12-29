import { readFileSync, writeFileSync } from 'node:fs';

const loadData = (path) => {
  try {
    const dataBuffer = readFileSync(path);
    const dataJSON = dataBuffer.toString();
    return JSON.parse(dataJSON);
  } catch (error) {
    return [];
  }
};

const saveData = (path, data) => {
  try {
    const dataJSON = JSON.stringify(data);
    writeFileSync(path, dataJSON);
  } catch (error) {
    throw `Error saving data - ${error}`;
  }
};

const addData = (path, data) => {
  try {
    const dataFile = loadData(path);
    if (Array.isArray(data)) {
      data.forEach((element) => {
        dataFile.push(element);
      });
    } else {
      dataFile.push(data);
    }

    saveData(path, dataFile);
  } catch (error) {
    throw `Error adding data - ${error}`;
  }
};

const countData = (path) => {
  try {
    const dataFile = loadData(path);
    return dataFile.length;
  } catch (error) {
    throw `Error counting data - ${error}`;
  }
};

const resetData = (path) => {
  try {
    saveData(path, []);
  } catch (error) {
    throw `Error reseting data - ${error}`;
  }
};

export { addData, countData, loadData, resetData };
