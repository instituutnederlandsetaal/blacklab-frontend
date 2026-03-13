package nl.inl.corpuswebsite.response;

import java.io.IOException;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.http.HttpResourceResponder;
import nl.inl.corpuswebsite.http.HttpResourceType;
import nl.inl.corpuswebsite.http.InMemoryHttpResource;
import nl.inl.corpuswebsite.velocity.TemplateUtils;

public class OidcCallbackResponse extends BaseResponse {
    public OidcCallbackResponse() {
        super("callback", false);
    }

    @Override
    protected void completeRequest() throws IOException {
        String rendered = TemplateUtils.renderTemplateToString(servlet.getTemplate("index"), model);
        InMemoryHttpResource resource = InMemoryHttpResource.fromString(rendered, HttpResourceType.ASSET, System.currentTimeMillis());
        HttpResourceResponder.serve(request, response, resource, "text/html; charset=utf-8"); 
   }
}
