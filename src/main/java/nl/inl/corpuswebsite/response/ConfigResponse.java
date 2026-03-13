package nl.inl.corpuswebsite.response;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.config.GlobalConfig;
import nl.inl.corpuswebsite.config.GlobalConfig.Keys;

/** Show the about page. */
public class ConfigResponse extends BaseResponse {
    public ConfigResponse() {
        super("config", false);
    }

    @Override
    protected void completeRequest() {
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");

        try (OutputStreamWriter osw = new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8)) {
            GlobalConfig globalConfig = servlet.getGlobalConfig();
            ObjectMapper mapper = new ObjectMapper();
            ObjectNode json = mapper.createObjectNode();
            json.put("BLS_URL", globalConfig.get(GlobalConfig.Keys.BLS_URL_ON_CLIENT));
            json.put("CF_URL", globalConfig.get(Keys.CF_URL_ON_CLIENT));
            json.put("commit_hash", GlobalConfig.commitHash);
            json.put("commit_time", GlobalConfig.commitTime);
            json.put("commit_message", GlobalConfig.commitMessage);
            json.put("version", GlobalConfig.version);
            json.put("branch", GlobalConfig.branch);
            osw.write(mapper.writeValueAsString(json));
            osw.flush();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
